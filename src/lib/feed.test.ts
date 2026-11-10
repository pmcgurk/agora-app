import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { post: { findMany } } }));

import type { AccessContext } from "@/lib/access";
import { cleanSearch, fetchPosts, MAX_SEARCH_LENGTH, pageSizeOf } from "@/lib/feed";

const stranger: AccessContext = { isOwner: false, maxActiveTierPrice: null };
const supporter: AccessContext = { isOwner: false, maxActiveTierPrice: 500 };
const owner: AccessContext = { isOwner: true, maxActiveTierPrice: null };

async function whereFor(access: AccessContext, q: string) {
  await fetchPosts({ creatorId: "creator-1", access, q, pageSize: 5 });
  return findMany.mock.calls[0][0].where as { creatorId: string; AND: Record<string, unknown>[] };
}

beforeEach(() => {
  findMany.mockReset();
  findMany.mockResolvedValue([]);
});

describe("feed: what a feed may contain", () => {
  it("only asks for published posts, for everyone including the creator", async () => {
    for (const access of [stranger, supporter, owner]) {
      findMany.mockClear();
      const where = await whereFor(access, "");
      expect(where.creatorId).toBe("creator-1");
      expect(where.AND[0]).toEqual({ publishedAt: { not: null, lte: expect.any(Date) } });
    }
  });

  it("orders newest first by publish time, with the id as a tie-breaker", async () => {
    await whereFor(stranger, "");
    expect(findMany.mock.calls[0][0].orderBy).toEqual([{ publishedAt: "desc" }, { id: "desc" }]);
  });

  it("asks for one extra row to learn whether there is another page", async () => {
    await whereFor(stranger, "");
    expect(findMany.mock.calls[0][0].take).toBe(6);
  });

  it("reports whether more posts exist and where to continue", async () => {
    findMany.mockResolvedValue(Array.from({ length: 6 }, (_, index) => ({ id: `p${index}` })));
    const result = await fetchPosts({ creatorId: "c", access: stranger, q: "", pageSize: 5 });
    expect(result.posts).toHaveLength(5);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("p4");
  });
});

describe("feed: search never reveals what is inside a locked post", () => {
  const textClause = (where: { AND: Record<string, unknown>[] }) =>
    (where.AND[1] as { OR: Record<string, unknown>[] }).OR.find((clause) => "AND" in clause) as { AND: Record<string, unknown>[] };

  it("always searches titles", async () => {
    const where = await whereFor(stranger, "kiln");
    const search = where.AND[1] as { OR: Record<string, unknown>[] };
    expect(search.OR[0]).toEqual({ title: { contains: "kiln", mode: "insensitive" } });
  });

  it("limits a visitor's text search to public posts", async () => {
    const clause = textClause(await whereFor(stranger, "kiln"));
    expect(clause.AND[1]).toEqual({ OR: [{ isPublic: true }] });
  });

  it("extends a supporter's text search to the tiers they can open, and no further", async () => {
    const clause = textClause(await whereFor(supporter, "kiln"));
    expect(clause.AND[1]).toEqual({ OR: [{ isPublic: true }, { minTier: { price: { lte: 500 } } }] });
  });

  it("lets the creator search the text of everything", async () => {
    const clause = textClause(await whereFor(owner, "kiln"));
    expect(clause.AND[1]).toEqual({});
  });

  it("adds no search conditions when there is nothing to search for", async () => {
    const where = await whereFor(stranger, "");
    expect(where.AND[1]).toEqual({});
  });
});

describe("feed: helpers", () => {
  it("trims search text and caps its length", () => {
    expect(cleanSearch("  hello ")).toBe("hello");
    expect(cleanSearch(undefined)).toBe("");
    expect(cleanSearch("x".repeat(500))).toHaveLength(MAX_SEARCH_LENGTH);
  });

  it("falls back to five posts a page unless the setting is one of the allowed sizes", () => {
    expect(pageSizeOf({ feedPageSize: 10 })).toBe(10);
    expect(pageSizeOf({ feedPageSize: 7 })).toBe(5);
    expect(pageSizeOf({})).toBe(5);
  });
});
