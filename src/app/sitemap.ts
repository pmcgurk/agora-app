import type { MetadataRoute } from "next";
import { postPathFor } from "@/lib/creator";
import { isDemoMode } from "@/lib/demo";
import { getSiteCreator, isPrivateInstance } from "@/lib/instance";
import { prisma } from "@/lib/prisma";
import { publishedWhere } from "@/lib/publishing";
import { siteBaseUrl } from "@/lib/rss";

export const dynamic = "force-dynamic";

const MAX_POSTS = 5000;

// Every public page a search engine may list: the home page, each creator, and their public posts.
// Private sites, the demo, drafts, scheduled posts and members-only posts are left out.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (isDemoMode() || (await isPrivateInstance())) return [];
  const base = siteBaseUrl();
  const site = await getSiteCreator();
  const creators = await prisma.user.findMany({ where: { role: "CREATOR" }, select: { id: true, slug: true }, take: 500 });
  const posts = await prisma.post.findMany({
    where: { isPublic: true, ...publishedWhere() },
    orderBy: { publishedAt: "desc" },
    take: MAX_POSTS,
    select: { id: true, slug: true, creatorId: true, publishedAt: true, editedAt: true },
  });
  const byId = new Map(creators.map((creator) => [creator.id, creator]));

  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    ...(site ? [] : creators.map((creator) => ({ url: `${base}/creators/${creator.slug ?? creator.id}`, changeFrequency: "daily" as const }))),
    ...posts.flatMap((post) => {
      const creator = byId.get(post.creatorId);
      if (!creator) return [];
      return [
        {
          url: `${base}${postPathFor(creator, post, site?.id === creator.id)}`,
          lastModified: post.editedAt ?? post.publishedAt ?? undefined,
          changeFrequency: "monthly" as const,
        },
      ];
    }),
  ];
}
