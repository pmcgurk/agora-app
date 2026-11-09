import type { Prisma } from "@/generated/prisma/client";
import type { AccessContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export const FEED_PAGE_SIZES = [3, 5, 10, 20] as const;
export const DEFAULT_PAGE_SIZE = 5;

export const pageSizeOf = (creator: { feedPageSize?: number }): number =>
  (FEED_PAGE_SIZES as readonly number[]).includes(creator.feedPageSize ?? 0) ? creator.feedPageSize! : DEFAULT_PAGE_SIZE;
export const MAX_SEARCH_LENGTH = 100;

export const cleanSearch = (value: string | undefined): string => (value ?? "").trim().slice(0, MAX_SEARCH_LENGTH);

// Titles are always searchable (locked posts show their title as a teaser anyway). Post text is only
// searched in posts the viewer can open, so a search can never reveal what is inside a locked post.
function searchWhere(q: string, access: AccessContext): Prisma.PostWhereInput {
  if (!q) return {};
  const openToViewer: Prisma.PostWhereInput = access.isOwner
    ? {}
    : {
        OR: [
          { isPublic: true },
          ...(access.maxActiveTierPrice !== null ? [{ minTier: { price: { lte: access.maxActiveTierPrice } } }] : []),
        ],
      };
  return {
    OR: [
      { title: { contains: q, mode: "insensitive" } },
      { AND: [{ textContent: { contains: q, mode: "insensitive" } }, openToViewer] },
    ],
  };
}

export type FeedPost = Awaited<ReturnType<typeof fetchPosts>>["posts"][number];

// One page of a creator's posts, newest first. Scrolling feeds pass a cursor (the last post id they
// have); paged feeds pass a page number.
export async function fetchPosts(options: {
  creatorId: string;
  access: AccessContext;
  q: string;
  cursor?: string | null;
  page?: number;
  pageSize: number;
}) {
  const { creatorId, access, q, cursor, page, pageSize } = options;
  const rows = await prisma.post.findMany({
    where: { creatorId, ...searchWhere(q, access) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : page && page > 1 ? { skip: (page - 1) * pageSize } : {}),
    include: {
      minTier: { select: { name: true, price: true } },
      media: {
        where: { inline: false },
        orderBy: { position: "asc" },
        select: { id: true, kind: true, fileName: true, size: true, blurObjectKey: true, previewObjectKey: true, thumbBlurObjectKey: true },
      },
      _count: { select: { likes: true, comments: true, media: { where: { inline: false } } } },
    },
  });
  const hasMore = rows.length > pageSize;
  const posts = rows.slice(0, pageSize);
  return { posts, hasMore, nextCursor: hasMore ? (posts.at(-1)?.id ?? null) : null };
}
