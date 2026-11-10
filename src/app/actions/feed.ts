"use server";

import type { ReactNode } from "react";
import PostArticles from "@/components/PostArticles";
import { getAccessContext } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { getCreator } from "@/lib/creator";
import { cleanSearch, fetchPosts, pageSizeOf } from "@/lib/feed";
import { prisma } from "@/lib/prisma";
import { requireInstanceAccess } from "@/lib/instance";
import { publishedWhere } from "@/lib/publishing";

export type MorePosts = { cards: ReactNode; next: string | null };

// The next batch of a creator's feed, rendered on the server with the viewer's own access.
export async function loadMorePosts(creatorId: string, q: string, cursor: string): Promise<MorePosts> {
  await requireInstanceAccess();
  const creator = await getCreator(creatorId);
  if (!creator || typeof cursor !== "string") return { cards: null, next: null };
  const access = await getAccessContext(creator.id, await getCurrentUser());
  const { posts, nextCursor } = await fetchPosts({ creatorId: creator.id, access, q: cleanSearch(q), cursor, pageSize: pageSizeOf(creator) });
  return { cards: await PostArticles({ creator, posts }), next: nextCursor };
}

// How many posts are newer than the newest one a visitor's page is showing.
export async function countNewPosts(creatorId: string, since: string): Promise<number> {
  await requireInstanceAccess();
  const date = new Date(since);
  if (Number.isNaN(date.getTime())) return 0;
  return prisma.post.count({ where: { creatorId, AND: [publishedWhere(), { publishedAt: { gt: date } }] } });
}
