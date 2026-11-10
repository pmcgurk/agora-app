import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import CreatorShell from "@/components/CreatorShell";
import { creatorPath, getCreator } from "@/lib/creator";
import { markdownExcerpt } from "@/lib/excerpt";
import { creatorIcons } from "@/lib/favicon";
import { getSiteCreator, requireInstanceAccess } from "@/lib/instance";

// On a site with several creators each page wears its own creator's name and icon.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const creator = await getCreator((await params).id);
  if (!creator) return {};
  const site = await getSiteCreator();
  const description = creator.tagline || markdownExcerpt(creator.bio ?? "", 160) || undefined;
  return {
    title: creator.name,
    description,
    icons: creatorIcons(creator, { single: site?.id === creator.id }),
    alternates: { types: { "application/rss+xml": `/creators/${creator.slug ?? creator.id}/feed.xml` } },
    openGraph: {
      type: "profile",
      title: creator.name,
      description,
      siteName: creator.name,
      images: creator.avatarKey ? [`/api/avatar/${creator.id}`] : [],
    },
  };
}

export default async function CreatorLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  await requireInstanceAccess();
  const creator = await getCreator((await params).id);
  if (!creator) notFound();
  const site = await getSiteCreator();

  return (
    <CreatorShell creator={creator} homeHref={site?.id === creator.id ? "/" : creatorPath(creator)}>
      {children}
    </CreatorShell>
  );
}
