import { prisma } from "@/lib/prisma";

import { slugify } from "@/lib/slugify";

export { slugify };

// A slug nobody else among this creator's posts uses: "my-post", then "my-post-2", "my-post-3"...
// The post being edited (if any) does not count against itself.
export async function uniquePostSlug(creatorId: string, title: string, excludePostId?: string): Promise<string> {
  const stem = slugify(title, 55);
  const rows = await prisma.post.findMany({
    where: { creatorId, slug: { startsWith: stem }, ...(excludePostId ? { id: { not: excludePostId } } : {}) },
    select: { slug: true },
  });
  const taken = new Set(rows.map((row) => row.slug));
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
