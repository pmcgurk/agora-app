import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import CreatorShell from "@/components/CreatorShell";
import { getSiteCreator, requireInstanceAccess } from "@/lib/instance";

// On a single-creator site posts live at /posts/<slug>, inside the creator's themed frame.
export default async function PostsLayout({ children }: { children: ReactNode }) {
  await requireInstanceAccess();
  const creator = await getSiteCreator();
  if (!creator) notFound();
  return (
    <CreatorShell creator={creator} homeHref="/">
      {children}
    </CreatorShell>
  );
}
