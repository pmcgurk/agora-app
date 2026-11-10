import type { Metadata } from "next";
import type { Creator } from "@/lib/creator";
import { postPathFor } from "@/lib/creator";
import { markdownExcerpt } from "@/lib/excerpt";
import { getSiteCreator } from "@/lib/instance";
import { prisma } from "@/lib/prisma";
import { isLive } from "@/lib/publishing";

const INLINE_IMAGE = /\(\/api\/media\/([A-Za-z0-9_-]{1,64})\)/;

// What link previews and search engines learn about a post. Only a post that is public and live gives
// away any of its content; a members-only post shows its title (the feed does too) and nothing else, and
// drafts and scheduled posts show nothing at all. Previews are fetched without a login, so this is what
// the rest of the world sees.
export async function postMetadata(creator: Creator, postId: string): Promise<Metadata> {
  const post = await prisma.post.findFirst({
    where: { creatorId: creator.id, OR: [{ slug: postId }, { id: postId }] },
    select: {
      id: true,
      slug: true,
      title: true,
      textContent: true,
      isPublic: true,
      publishedAt: true,
      editedAt: true,
      media: { where: { kind: "IMAGE", inline: false }, orderBy: { position: "asc" }, take: 1, select: { id: true } },
    },
  });
  if (!post || !isLive(post.publishedAt)) return { robots: { index: false, follow: false } };

  const isSite = (await getSiteCreator())?.id === creator.id;
  const path = postPathFor(creator, post, isSite);
  // Setting alternates here replaces the site-wide value, so the feed link is repeated.
  const feed = isSite ? "/feed.xml" : `/creators/${creator.slug ?? creator.id}/feed.xml`;
  const alternates = { canonical: path, types: { "application/rss+xml": feed } };

  if (!post.isPublic) {
    return {
      title: post.title,
      description: `A members-only post by ${creator.name}.`,
      alternates,
      robots: { index: false, follow: false },
    };
  }

  const description = markdownExcerpt(post.textContent, 200) || `A post by ${creator.name}.`;
  const imageId = post.media[0]?.id ?? INLINE_IMAGE.exec(post.textContent)?.[1];
  // Media addresses redirect to a short-lived storage link, which a crawler follows straight away.
  const images = imageId ? [`/api/media/${imageId}`] : creator.avatarKey ? [`/api/avatar/${creator.id}`] : [];
  return {
    title: post.title,
    description,
    alternates,
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: path,
      siteName: creator.name,
      publishedTime: post.publishedAt!.toISOString(),
      ...(post.editedAt ? { modifiedTime: post.editedAt.toISOString() } : {}),
      authors: [creator.name],
      images,
    },
    twitter: { card: images.length > 0 ? "summary_large_image" : "summary", title: post.title, description, images },
  };
}
