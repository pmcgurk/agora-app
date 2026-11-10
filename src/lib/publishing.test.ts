import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateMany, findMany, notifyNewPost } = vi.hoisted(() => ({ updateMany: vi.fn(), findMany: vi.fn(), notifyNewPost: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { post: { updateMany, findMany } } }));
vi.mock("@/lib/notifications", () => ({ notifyNewPost }));

import { announceDuePosts, announceIfDue, isLive, postState, publishedWhere, unpublishedWhere } from "@/lib/publishing";

const now = new Date("2026-06-01T12:00:00Z");
const before = new Date("2026-06-01T11:59:00Z");
const after = new Date("2026-06-01T12:01:00Z");

describe("post state", () => {
  it("calls a post with no publish time a draft", () => {
    expect(postState({ publishedAt: null }, now)).toBe("draft");
    expect(isLive(null, now)).toBe(false);
  });

  it("calls a post with a future time scheduled", () => {
    expect(postState({ publishedAt: after }, now)).toBe("scheduled");
    expect(isLive(after, now)).toBe(false);
  });

  it("calls a post whose time has come published, including exactly at that moment", () => {
    expect(postState({ publishedAt: before }, now)).toBe("published");
    expect(postState({ publishedAt: now }, now)).toBe("published");
    expect(isLive(now, now)).toBe(true);
  });
});

describe("filters", () => {
  it("publishedWhere excludes drafts and future posts", () => {
    expect(publishedWhere(now)).toEqual({ publishedAt: { not: null, lte: now } });
  });

  it("unpublishedWhere spells out the null case (NOT of publishedWhere would drop drafts in SQL)", () => {
    expect(unpublishedWhere(now)).toEqual({ OR: [{ publishedAt: null }, { publishedAt: { gt: now } }] });
  });
});

describe("announcing posts", () => {
  beforeEach(() => {
    updateMany.mockReset();
    findMany.mockReset();
    notifyNewPost.mockReset();
  });

  it("tells subscribers once: whoever flips announcedAt does the announcing", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await announceIfDue("post-1");
    expect(notifyNewPost).toHaveBeenCalledExactlyOnceWith("post-1");
  });

  it("does nothing when the post was already announced or is not live yet", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await announceIfDue("post-1");
    expect(notifyNewPost).not.toHaveBeenCalled();
  });

  it("only claims posts that are live and not announced", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await announceIfDue("post-1");
    const where = updateMany.mock.calls[0][0].where;
    expect(where.id).toBe("post-1");
    expect(where.announcedAt).toBeNull();
    expect(where.publishedAt.not).toBeNull();
    expect(where.publishedAt.lte).toBeInstanceOf(Date);
  });

  it("announces every due post in turn", async () => {
    findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    updateMany.mockResolvedValue({ count: 1 });
    expect(await announceDuePosts()).toBe(2);
    expect(notifyNewPost.mock.calls.map((call) => call[0])).toEqual(["a", "b"]);
  });
});
