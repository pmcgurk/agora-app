import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/instance", () => ({ siteName: async () => "Test Site", getSiteCreator: async () => null, isPrivateInstance: async () => false }));
vi.mock("@/lib/creator", () => ({ postPath: async (_creator: unknown, post: { slug: string }) => `/posts/${post.slug}` }));

import { composePostEmail, type NewsletterPost } from "@/lib/newsletter";

const ACCOUNT_EMAIL = "paul.private@signup.example";

// The creator row as the database has it, which includes the address they signed up with.
const creator = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "c1",
    name: "Paul McGurk",
    email: ACCOUNT_EMAIL,
    slug: "paul",
    themeName: "light",
    themeSettings: null,
    fontBody: null,
    fontHeading: null,
    avatarKey: null,
    newsletterFormat: "EXCERPT",
    emailFromName: null,
    emailReplyTo: null,
    ...overrides,
  }) as unknown as NewsletterPost["creator"];

const post = (overrides: Partial<NewsletterPost> = {}): NewsletterPost => ({
  id: "p1",
  slug: "kiln",
  title: "The big kiln",
  textContent: "First paragraph.\n\n![A bowl](/api/media/abc)\n\nSecond paragraph.",
  publishedAt: new Date("2026-11-10T09:00:00Z"),
  isPublic: true,
  creator: creator(),
  ...overrides,
});

const recipient = { email: "sam@example.com", unsubscribeToken: "a".repeat(64) };

beforeEach(() => {
  process.env.NEXT_PUBLIC_BASE_URL = "https://blog.example.com";
});

describe("send as", () => {
  it("shows the creator's public name, by default", async () => {
    const message = await composePostEmail(post(), recipient);
    expect(message.fromName).toBe("Paul McGurk");
    expect(message.replyTo).toBeUndefined();
  });

  it("uses the name the creator chose, and the reply-to they chose", async () => {
    const message = await composePostEmail(post({ creator: creator({ emailFromName: "Paul at the Pottery", emailReplyTo: "hello@pottery.example" }) }), recipient);
    expect(message.fromName).toBe("Paul at the Pottery");
    expect(message.replyTo).toBe("hello@pottery.example");
    expect(message.text).toContain("You can reply to this email to write to Paul McGurk.");
  });

  it("never carries the address the creator signed up with, anywhere in the message", async () => {
    for (const format of ["EXCERPT", "FULL"] as const) {
      const message = await composePostEmail(post({ creator: creator({ emailFromName: "Pottery" }) }), recipient, format);
      expect(JSON.stringify(message)).not.toContain(ACCOUNT_EMAIL);
    }
  });
});

describe("what is in the email", () => {
  it("is a short taste with a button by default", async () => {
    const long = post({ textContent: `First paragraph. ${"word ".repeat(120)}

Second paragraph.` });
    const message = await composePostEmail(long, recipient);
    expect(message.html).toContain("Read the post");
    expect(message.html).not.toContain("Second paragraph");
  });

  it("is the whole post when the creator sends the full post", async () => {
    const message = await composePostEmail(post({ creator: creator({ newsletterFormat: "FULL" }) }), recipient);
    expect(message.html).toContain("First paragraph.");
    expect(message.html).toContain("Second paragraph.");
    expect(message.text).toContain("Second paragraph.");
  });

  it("can be previewed in the other format without changing the saved choice", async () => {
    const message = await composePostEmail(post(), recipient, "FULL");
    expect(message.html).toContain("Second paragraph.");
  });

  it("includes pictures of a public post, from this site", async () => {
    const message = await composePostEmail(post(), recipient, "FULL");
    expect(message.html).toContain('<img src="https://blog.example.com/api/media/abc"');
  });

  it("leaves out pictures of a members-only post, where a mail client has no login", async () => {
    const message = await composePostEmail(post({ isPublic: false }), recipient, "FULL");
    expect(message.html).not.toContain("<img");
    expect(message.html).toContain("https://blog.example.com/posts/kiln");
  });

  it("links to the post and to a working unsubscribe", async () => {
    const message = await composePostEmail(post(), recipient);
    expect(message.html).toContain('href="https://blog.example.com/posts/kiln"');
    expect(message.headers?.["List-Unsubscribe"]).toBe(`<https://blog.example.com/api/unsubscribe/${"a".repeat(64)}>`);
  });
});
