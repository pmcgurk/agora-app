import { createElement } from "react";
import Markdown from "@/components/Markdown";
import type { Creator } from "@/lib/creator";
import { postPathFor } from "@/lib/creator";
import { markdownExcerpt } from "@/lib/excerpt";
import { getSiteCreator } from "@/lib/instance";
import { prisma } from "@/lib/prisma";
import { publishedWhere } from "@/lib/publishing";

const MAX_ITEMS = 30;

export const siteBaseUrl = (): string => (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

const xml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

// CDATA cannot contain its own terminator, so split it across two sections.
const cdata = (value: string) => `<![CDATA[${value.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;

// An RSS feed of a creator's public posts. Members-only posts, drafts and scheduled posts are never in
// it: a feed reader has no login, and a feed is copied around for good.
export async function buildFeed(creator: Creator, selfPath: string): Promise<string> {
  const base = siteBaseUrl();
  const isSite = (await getSiteCreator())?.id === creator.id;
  const posts = await prisma.post.findMany({
    where: { creatorId: creator.id, isPublic: true, ...publishedWhere() },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: MAX_ITEMS,
    select: { id: true, slug: true, title: true, textContent: true, publishedAt: true },
  });

  // Loaded here so the feed's HTML rendering stays out of the page bundles.
  const { renderToStaticMarkup } = await import("react-dom/server");
  const absoluteImage = (src: string) => (/^\/api\/media\/[A-Za-z0-9_-]{1,64}$/.test(src) ? `${base}${src}` : null);

  const items = posts.map((post) => {
    const link = `${base}${postPathFor(creator, post, isSite)}`;
    const html = renderToStaticMarkup(createElement(Markdown, { source: post.textContent, resolveImage: absoluteImage }));
    return `    <item>
      <title>${xml(post.title)}</title>
      <link>${xml(link)}</link>
      <guid isPermaLink="true">${xml(link)}</guid>
      <pubDate>${post.publishedAt!.toUTCString()}</pubDate>
      <dc:creator>${xml(creator.name)}</dc:creator>
      <description>${xml(markdownExcerpt(post.textContent, 280))}</description>
      <content:encoded>${cdata(html)}</content:encoded>
    </item>`;
  });

  const home = isSite ? `${base}/` : `${base}/creators/${creator.slug ?? creator.id}`;
  const description = creator.tagline || markdownExcerpt(creator.bio ?? "", 200) || `Posts by ${creator.name}`;
  const newest = posts[0]?.publishedAt ?? new Date();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xml(creator.name)}</title>
    <link>${xml(home)}</link>
    <description>${xml(description)}</description>
    <language>en</language>
    <lastBuildDate>${newest.toUTCString()}</lastBuildDate>
    <atom:link href="${xml(`${base}${selfPath}`)}" rel="self" type="application/rss+xml" />
${items.join("\n")}
  </channel>
</rss>
`;
}

export const FEED_HEADERS = {
  "Content-Type": "application/rss+xml; charset=utf-8",
  "Cache-Control": "public, max-age=300",
};
