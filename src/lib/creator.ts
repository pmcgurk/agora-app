import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getSiteCreator } from "@/lib/instance";

// Creators are reachable by their chosen page name (slug) or by id.
export const getCreator = cache(async (idOrSlug: string) =>
  prisma.user.findFirst({
    where: { role: "CREATOR", OR: [{ slug: idOrSlug }, { id: idOrSlug }] },
    orderBy: { slug: { sort: "asc", nulls: "last" } },
  }),
);

export type Creator = NonNullable<Awaited<ReturnType<typeof getCreator>>>;

export function creatorPath(creator: { id: string; slug: string | null }): string {
  return `/creators/${creator.slug ?? creator.id}`;
}

// On a single-creator site the support page lives at /support, with no creator in the address.
export async function supportPath(creator: { id: string; slug: string | null }): Promise<string> {
  const site = await getSiteCreator();
  return site?.id === creator.id ? "/support" : `${creatorPath(creator)}/support`;
}

// The address of a post. On a single-creator site it is /posts/<slug>; on a site with several creators it
// stays under the creator. Posts without a slug (made before slugs existed) fall back to their id.
export function postPathFor(
  creator: { id: string; slug: string | null },
  post: { id: string; slug: string | null },
  isSiteCreator: boolean,
): string {
  const key = post.slug ?? post.id;
  return isSiteCreator ? `/posts/${key}` : `${creatorPath(creator)}/posts/${key}`;
}

export async function postPath(creator: { id: string; slug: string | null }, post: { id: string; slug: string | null }): Promise<string> {
  return postPathFor(creator, post, (await getSiteCreator())?.id === creator.id);
}
