import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, getSiteCreator } = vi.hoisted(() => ({ findMany: vi.fn(), getSiteCreator: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { post: { findMany } } }));
vi.mock("@/lib/instance", () => ({ getSiteCreator }));

import type { Creator } from "@/lib/creator";
import { buildFeed } from "@/lib/rss";

const creator = { id: "c1", slug: "paul", name: "Paul <Test> & Co", tagline: "Notes & things", bio: null } as unknown as Creator;
const post = (overrides = {}) => ({
  id: "p1",
  slug: "hello-world",
  title: "Hello & welcome",
  textContent: "Some **bold** text.\n\n![pic](/api/media/abc123)\n\n[x](javascript:alert(1))",
  publishedAt: new Date("2026-03-04T10:00:00Z"),
  ...overrides,
});

beforeEach(() => {
  findMany.mockReset();
  getSiteCreator.mockResolvedValue({ id: "c1" });
  process.env.NEXT_PUBLIC_BASE_URL = "https://blog.example.com/";
  findMany.mockResolvedValue([post()]);
});

describe("RSS feed", () => {
  it("asks only for public posts that are live, newest first, capped", async () => {
    await buildFeed(creator, "/feed.xml");
    const query = findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({ creatorId: "c1", isPublic: true, publishedAt: { not: null, lte: expect.any(Date) } });
    expect(query.orderBy[0]).toEqual({ publishedAt: "desc" });
    expect(query.take).toBe(30);
  });

  it("links posts by their readable address on the site's own domain", async () => {
    const feed = await buildFeed(creator, "/feed.xml");
    expect(feed).toContain("<link>https://blog.example.com/posts/hello-world</link>");
    expect(feed).toContain('<guid isPermaLink="true">https://blog.example.com/posts/hello-world</guid>');
    expect(feed).toContain('<atom:link href="https://blog.example.com/feed.xml" rel="self"');
  });

  it("keeps posts under the creator on a site with several creators", async () => {
    getSiteCreator.mockResolvedValue(null);
    const feed = await buildFeed(creator, "/creators/paul/feed.xml");
    expect(feed).toContain("<link>https://blog.example.com/creators/paul/posts/hello-world</link>");
  });

  it("escapes titles and names so the XML stays valid", async () => {
    const feed = await buildFeed(creator, "/feed.xml");
    expect(feed).toContain("<title>Hello &amp; welcome</title>");
    expect(feed).toContain("<title>Paul &lt;Test&gt; &amp; Co</title>");
    expect(feed).not.toContain("Paul <Test>");
  });

  it("puts the post body in as HTML with absolute picture addresses and no dangerous links", async () => {
    const feed = await buildFeed(creator, "/feed.xml");
    const content = feed.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/)![1];
    expect(content).toContain("<strong>bold</strong>");
    expect(content).toContain('src="https://blog.example.com/api/media/abc123"');
    expect(content).not.toContain("javascript:");
  });

  it("cannot be broken out of by a CDATA terminator in the text", async () => {
    findMany.mockResolvedValue([post({ textContent: "evil ]]> <script>alert(1)</script>" })]);
    const feed = await buildFeed(creator, "/feed.xml");
    const item = feed.slice(feed.indexOf("<item>"), feed.indexOf("</item>"));
    expect(item).not.toContain("<script>");
    // The terminator is escaped as text, so the CDATA section only ends where the feed ends it.
    expect(item).toContain("]]&gt;");
    expect(item.match(/\]\]>/g)).toHaveLength(1);
  });

  it("gives a plain-text summary in the description", async () => {
    const feed = await buildFeed(creator, "/feed.xml");
    expect(feed).toContain("<description>Some bold text. x</description>");
  });

  it("is still a valid, empty feed when there are no posts", async () => {
    findMany.mockResolvedValue([]);
    const feed = await buildFeed(creator, "/feed.xml");
    expect(feed).toContain("<channel>");
    expect(feed).not.toContain("<item>");
  });
});
