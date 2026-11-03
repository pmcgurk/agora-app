import { cache } from "react";
import { prisma } from "@/lib/prisma";

// Creators are reachable by their chosen page name (slug) or by id.
export const getCreator = cache(async (idOrSlug: string) =>
  prisma.user.findFirst({
    where: { role: "CREATOR", OR: [{ slug: idOrSlug }, { id: idOrSlug }] },
    orderBy: { slug: { sort: "asc", nulls: "last" } },
  }),
);

export function creatorPath(creator: { id: string; slug: string | null }): string {
  return `/creators/${creator.slug ?? creator.id}`;
}
