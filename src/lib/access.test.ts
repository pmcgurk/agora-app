import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/blocks", () => ({ isBlocked: vi.fn() }));

import { canView, type AccessContext } from "@/lib/access";

const past = new Date(Date.now() - 60_000);
const future = new Date(Date.now() + 60 * 60_000);

const stranger: AccessContext = { isOwner: false, maxActiveTierPrice: null };
const owner: AccessContext = { isOwner: true, maxActiveTierPrice: null };
const follower: AccessContext = { isOwner: false, maxActiveTierPrice: 0 };
const supporter: AccessContext = { isOwner: false, maxActiveTierPrice: 500 };

const publicPost = { isPublic: true, minTier: null, publishedAt: past };
const tierPost = (price: number) => ({ isPublic: false, minTier: { price }, publishedAt: past });

describe("canView: tier access", () => {
  it("lets anyone read a public post", () => {
    expect(canView(publicPost, stranger)).toBe(true);
  });

  it("keeps a tier post from visitors who are not subscribed", () => {
    expect(canView(tierPost(500), stranger)).toBe(false);
  });

  it("opens a tier post to a subscriber on that tier or a dearer one", () => {
    expect(canView(tierPost(500), supporter)).toBe(true);
    expect(canView(tierPost(300), supporter)).toBe(true);
  });

  it("keeps a dearer tier's post from a cheaper subscriber", () => {
    expect(canView(tierPost(1200), supporter)).toBe(false);
    expect(canView(tierPost(500), follower)).toBe(false);
  });

  it("treats the free follower tier (price 0) as access to free-tier posts", () => {
    expect(canView(tierPost(0), follower)).toBe(true);
  });

  it("hides a non-public post that has no tier from everyone but its creator", () => {
    const orphan = { isPublic: false, minTier: null, publishedAt: past };
    expect(canView(orphan, supporter)).toBe(false);
    expect(canView(orphan, owner)).toBe(true);
  });

  it("always lets the creator see their own posts", () => {
    expect(canView(tierPost(99_999), owner)).toBe(true);
  });
});

describe("canView: drafts and scheduled posts", () => {
  const draft = { isPublic: true, minTier: null, publishedAt: null };
  const scheduled = { isPublic: true, minTier: null, publishedAt: future };

  it("hides a draft from everyone but the creator, even when it is public", () => {
    expect(canView(draft, stranger)).toBe(false);
    expect(canView(draft, supporter)).toBe(false);
    expect(canView(draft, owner)).toBe(true);
  });

  it("hides a scheduled post until its time", () => {
    expect(canView(scheduled, stranger)).toBe(false);
    expect(canView(scheduled, supporter)).toBe(false);
    expect(canView(scheduled, owner)).toBe(true);
  });

  it("shows a post whose scheduled time has passed", () => {
    expect(canView({ isPublic: true, minTier: null, publishedAt: new Date(Date.now() - 1) }, stranger)).toBe(true);
  });

  it("hides an unpublished tier post even from a subscriber on that tier", () => {
    expect(canView({ isPublic: false, minTier: { price: 500 }, publishedAt: future }, supporter)).toBe(false);
  });
});
