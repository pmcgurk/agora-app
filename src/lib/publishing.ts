import type { Prisma } from "@/generated/prisma/client";
import { notifyNewPost } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

// Post.publishedAt: null is a draft, a future time is a scheduled post, anything else is published.

export type PostState = "draft" | "scheduled" | "published";

export const isLive = (publishedAt: Date | null, now = new Date()): boolean => publishedAt !== null && publishedAt <= now;

export function postState(post: { publishedAt: Date | null }, now = new Date()): PostState {
  if (post.publishedAt === null) return "draft";
  return post.publishedAt <= now ? "published" : "scheduled";
}

// Prisma filter for posts every visitor may see (subject to the usual tier gating).
export const publishedWhere = (now = new Date()): Prisma.PostWhereInput => ({ publishedAt: { not: null, lte: now } });

// Tells subscribers and webhooks about a post once it is live, exactly once even if several callers
// race: whoever flips announcedAt from null does the announcing.
export async function announceIfDue(postId: string): Promise<void> {
  const claimed = await prisma.post.updateMany({
    where: { id: postId, announcedAt: null, ...publishedWhere() },
    data: { announcedAt: new Date() },
  });
  if (claimed.count === 1) await notifyNewPost(postId);
}

// Announces every scheduled post whose time has come. Called by the publisher timer.
export async function announceDuePosts(): Promise<number> {
  const due = await prisma.post.findMany({
    where: { announcedAt: null, ...publishedWhere() },
    select: { id: true },
    orderBy: { publishedAt: "asc" },
    take: 50,
  });
  for (const { id } of due) await announceIfDue(id);
  return due.length;
}

// Prisma filter for posts that are not live yet: drafts and scheduled posts. (Written out rather than as
// NOT(publishedWhere()), because SQL's handling of NULL would drop the drafts.)
export const unpublishedWhere = (now = new Date()): Prisma.PostWhereInput => ({
  OR: [{ publishedAt: null }, { publishedAt: { gt: now } }],
});

// How many drafts and scheduled posts a creator has, for the dashboard.
export async function countUnpublished(creatorId: string): Promise<{ drafts: number; scheduled: number }> {
  const now = new Date();
  const [drafts, scheduled] = await Promise.all([
    prisma.post.count({ where: { creatorId, publishedAt: null } }),
    prisma.post.count({ where: { creatorId, publishedAt: { gt: now } } }),
  ]);
  return { drafts, scheduled };
}
