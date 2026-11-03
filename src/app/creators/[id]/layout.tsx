import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import CreatorShell from "@/components/CreatorShell";
import { creatorPath, getCreator } from "@/lib/creator";
import { getSiteCreator, requireInstanceAccess } from "@/lib/instance";

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
