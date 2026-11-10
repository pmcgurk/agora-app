import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => {
  const model = () => ({ findMany: vi.fn().mockResolvedValue([]) });
  return {
    prisma: {
      user: { findUnique: vi.fn() },
      subscription: model(),
      payment: model(),
      comment: model(),
      postLike: model(),
      message: model(),
      notification: model(),
      post: model(),
      tier: model(),
    },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma }));

import { buildAccountExport } from "@/lib/account-export";

const account = (role: "PATRON" | "CREATOR") => ({ id: "u1", name: "Sam", email: "sam@example.com", role });

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(account("PATRON"));
  for (const model of [prisma.subscription, prisma.payment, prisma.comment, prisma.postLike, prisma.message, prisma.notification, prisma.post, prisma.tier]) {
    model.findMany.mockResolvedValue([]);
  }
});

describe("data export", () => {
  it("returns nothing for an account that does not exist", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    expect(await buildAccountExport("nope")).toBeNull();
  });

  it("never asks for password hashes, tokens or sessions", async () => {
    await buildAccountExport("u1");
    const selected = JSON.stringify(prisma.user.findUnique.mock.calls[0][0].select);
    expect(selected).not.toMatch(/passwordHash|stripeCustomerId|avatarKey|tokenHash/);
  });

  it("names the other side of a message but never gives their email address", async () => {
    await buildAccountExport("u1");
    for (const call of prisma.message.findMany.mock.calls) {
      const select = JSON.stringify(call[0].select);
      expect(select).not.toContain("email");
    }
  });

  it("only exports the account's own rows", async () => {
    await buildAccountExport("u1");
    expect(prisma.subscription.findMany.mock.calls[0][0].where).toEqual({ patronId: "u1" });
    expect(prisma.payment.findMany.mock.calls[0][0].where).toEqual({ patronId: "u1" });
    expect(prisma.comment.findMany.mock.calls[0][0].where).toEqual({ authorId: "u1" });
    expect(prisma.postLike.findMany.mock.calls[0][0].where).toEqual({ userId: "u1" });
    expect(prisma.message.findMany.mock.calls.map((c) => c[0].where)).toEqual([{ senderId: "u1" }, { recipientId: "u1" }]);
  });

  it("shapes the data and leaves posts and tiers out for a member", async () => {
    prisma.comment.findMany.mockResolvedValue([{ body: "Nice", createdAt: new Date("2026-01-02"), post: { title: "Hello" } }]);
    const data = await buildAccountExport("u1");
    expect(data!.comments).toEqual([{ post: "Hello", body: "Nice", date: new Date("2026-01-02") }]);
    expect(data).not.toHaveProperty("posts");
    expect(prisma.post.findMany).not.toHaveBeenCalled();
    expect(data!.about).toMatch(/Passwords/);
  });

  it("includes a creator's posts and tiers", async () => {
    prisma.user.findUnique.mockResolvedValue(account("CREATOR"));
    prisma.post.findMany.mockResolvedValue([{ title: "Hello", slug: "hello", textContent: "Hi", isPublic: true, createdAt: new Date(), publishedAt: new Date(), editedAt: null, minTier: null }]);
    const data = await buildAccountExport("u1");
    expect(data!.posts).toHaveLength(1);
    expect(data).toHaveProperty("tiers");
    expect(prisma.post.findMany.mock.calls[0][0].where).toEqual({ creatorId: "u1" });
  });
});
