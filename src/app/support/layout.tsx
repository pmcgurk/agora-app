import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import CreatorShell from "@/components/CreatorShell";
import { getSiteCreator, requireInstanceAccess } from "@/lib/instance";

// /support belongs to the site's creator, so it gets the same themed frame as their other pages.
export default async function SupportLayout({ children }: { children: ReactNode }) {
  await requireInstanceAccess();
  const creator = await getSiteCreator();
  if (!creator) notFound();
  return (
    <CreatorShell creator={creator} homeHref="/">
      {children}
    </CreatorShell>
  );
}
