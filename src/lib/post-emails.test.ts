import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, getMailSettings, sendMail } = vi.hoisted(() => ({
  prisma: {
    post: { findUnique: vi.fn() },
    subscription: { findMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    postEmail: { createMany: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
  getMailSettings: vi.fn(),
  sendMail: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/mail", () => ({ getMailSettings, sendMail }));
vi.mock("@/lib/instance", () => ({ siteName: async () => "Test Site", getSiteCreator: async () => ({ id: "c1" }) }));

import { findUnsubscribeTarget, queuePostEmails, sendQueuedPostEmails, unsubscribeByToken } from "@/lib/post-emails";

const TOKEN = "a".repeat(64);
const past = new Date(Date.now() - 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = "https://blog.example.com";
  getMailSettings.mockResolvedValue({ host: "smtp.example.com" });
  sendMail.mockResolvedValue({ ok: true });
  prisma.postEmail.updateMany.mockResolvedValue({ count: 1 });
  prisma.postEmail.createMany.mockResolvedValue({ count: 2 });
});

describe("queueing new-post emails", () => {
  const post = (overrides = {}) => ({ id: "p1", creatorId: "c1", isPublic: true, minTier: null, ...overrides });

  it("does nothing on a site that cannot send email", async () => {
    getMailSettings.mockResolvedValue(null);
    expect(await queuePostEmails("p1")).toBe(0);
    expect(prisma.post.findUnique).not.toHaveBeenCalled();
  });

  it("queues followers who opted in and have a confirmed address, once each", async () => {
    prisma.post.findUnique.mockResolvedValue(post());
    prisma.subscription.findMany.mockResolvedValue([{ patronId: "a" }, { patronId: "b" }, { patronId: "a" }]);
    expect(await queuePostEmails("p1")).toBe(2);
    const where = prisma.subscription.findMany.mock.calls[0][0].where;
    expect(where.patron).toEqual({ emailPosts: true, emailVerifiedAt: { not: null } });
    expect(where.tier).toEqual({ creatorId: "c1" });
    expect(prisma.postEmail.createMany).toHaveBeenCalledWith({
      data: [{ postId: "p1", userId: "a" }, { postId: "p1", userId: "b" }],
      skipDuplicates: true,
    });
  });

  it("only reaches members whose tier can read a members-only post", async () => {
    prisma.post.findUnique.mockResolvedValue(post({ isPublic: false, minTier: { price: 500 } }));
    prisma.subscription.findMany.mockResolvedValue([{ patronId: "a" }]);
    await queuePostEmails("p1");
    expect(prisma.subscription.findMany.mock.calls[0][0].where.tier).toEqual({ creatorId: "c1", price: { gte: 500 } });
  });

  it("emails nobody about a post that is for its creator alone", async () => {
    prisma.post.findUnique.mockResolvedValue(post({ isPublic: false, minTier: null }));
    expect(await queuePostEmails("p1")).toBe(0);
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
  });

  it("never queues the creator for their own post", async () => {
    prisma.post.findUnique.mockResolvedValue(post());
    prisma.subscription.findMany.mockResolvedValue([{ patronId: "c1" }]);
    expect(await queuePostEmails("p1")).toBe(0);
    expect(prisma.postEmail.createMany).not.toHaveBeenCalled();
  });
});

describe("sending the queue", () => {
  const row = (overrides: Record<string, unknown> = {}, user: Record<string, unknown> = {}) => ({
    id: "e1",
    user: { id: "u1", name: "Sam", email: "sam@example.com", emailPosts: true, emailVerifiedAt: new Date(), unsubscribeToken: TOKEN, ...user },
    post: { id: "p1", slug: "hello", title: "Hello world", textContent: "Some **words** here.", publishedAt: past, creator: { id: "c1", name: "Paul", slug: "paul" } },
    ...overrides,
  });

  it("sends nothing when there is no mail setup or nothing queued", async () => {
    getMailSettings.mockResolvedValue(null);
    expect(await sendQueuedPostEmails()).toEqual({ sent: 0, failed: 0, skipped: 0 });
    getMailSettings.mockResolvedValue({ host: "x" });
    prisma.postEmail.findMany.mockResolvedValue([]);
    expect(await sendQueuedPostEmails()).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends the email with the post link and a one-click unsubscribe, then marks it sent", async () => {
    prisma.postEmail.findMany.mockResolvedValue([row()]);
    expect(await sendQueuedPostEmails()).toEqual({ sent: 1, failed: 0, skipped: 0 });
    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe("sam@example.com");
    expect(message.subject).toBe("New post: Hello world");
    expect(message.text).toContain("https://blog.example.com/posts/hello");
    expect(message.text).toContain(`https://blog.example.com/unsubscribe/${TOKEN}`);
    expect(message.text).toContain("Some words here.");
    expect(message.headers).toEqual({
      "List-Unsubscribe": `<https://blog.example.com/api/unsubscribe/${TOKEN}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(prisma.postEmail.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { sentAt: expect.any(Date), lastError: null } });
  });

  it("counts the attempt before sending, so a crash cannot loop forever", async () => {
    prisma.postEmail.findMany.mockResolvedValue([row()]);
    await sendQueuedPostEmails();
    expect(prisma.postEmail.updateMany).toHaveBeenCalledWith({ where: { id: "e1", sentAt: null }, data: { attempts: { increment: 1 } } });
    expect(prisma.postEmail.updateMany.mock.invocationCallOrder[0]).toBeLessThan(sendMail.mock.invocationCallOrder[0]);
  });

  it("only picks up rows that are unsent and under the attempt limit", async () => {
    prisma.postEmail.findMany.mockResolvedValue([]);
    await sendQueuedPostEmails();
    expect(prisma.postEmail.findMany.mock.calls[0][0]).toMatchObject({ where: { sentAt: null, attempts: { lt: 3 } }, take: 50 });
  });

  it("skips, and closes out, someone who unsubscribed or has no confirmed address since it was queued", async () => {
    prisma.postEmail.findMany.mockResolvedValue([row({}, { emailPosts: false }), row({ id: "e2" }, { emailVerifiedAt: null })]);
    expect(await sendQueuedPostEmails()).toEqual({ sent: 0, failed: 0, skipped: 2 });
    expect(sendMail).not.toHaveBeenCalled();
    expect(prisma.postEmail.update).toHaveBeenCalledTimes(2);
  });

  it("skips a post that went back to a draft after it was queued", async () => {
    prisma.postEmail.findMany.mockResolvedValue([row({ post: { ...row().post, publishedAt: null } })]);
    expect(await sendQueuedPostEmails()).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("records a failure and leaves the row to be retried", async () => {
    prisma.postEmail.findMany.mockResolvedValue([row()]);
    sendMail.mockResolvedValue({ ok: false, error: "The email could not be sent." });
    expect(await sendQueuedPostEmails()).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(prisma.postEmail.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { lastError: "The email could not be sent." } });
  });
});

describe("unsubscribing", () => {
  it("turns emails off for whoever the link belongs to", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", name: "Sam" });
    expect(await unsubscribeByToken(TOKEN)).toEqual({ name: "Sam" });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { emailPosts: false } });
  });

  it("does not touch the database for something that cannot be a token", async () => {
    for (const junk of ["", "abc", "A".repeat(64), "z".repeat(64), `${"a".repeat(63)}!`]) {
      expect(await unsubscribeByToken(junk)).toBeNull();
      expect(await findUnsubscribeTarget(junk)).toBeNull();
    }
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("changes nothing for an unknown link", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    expect(await unsubscribeByToken(TOKEN)).toBeNull();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("can look at a link without using it", async () => {
    prisma.user.findUnique.mockResolvedValue({ name: "Sam", emailPosts: true });
    expect(await findUnsubscribeTarget(TOKEN)).toEqual({ name: "Sam", subscribed: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
