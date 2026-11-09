import { notFound, redirect } from "next/navigation";
import CreatorFeed from "@/components/CreatorFeed";
import { getCreator } from "@/lib/creator";
import { getSiteCreator } from "@/lib/instance";

export const dynamic = "force-dynamic";

export default async function CreatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string; q?: string; page?: string }>;
}) {
  const { id } = await params;
  const { error, notice, q, page } = await searchParams;
  const creator = await getCreator(id);
  if (!creator) notFound();

  // On a single-creator instance the feed lives at the root.
  if ((await getSiteCreator())?.id === creator.id) {
    const query = new URLSearchParams();
    if (notice) query.set("notice", notice);
    if (error) query.set("error", error);
    if (q) query.set("q", q);
    if (page) query.set("page", page);
    redirect(query.size > 0 ? `/?${query}` : "/");
  }

  return <CreatorFeed creator={creator} notice={notice} error={error} q={q} page={page} />;
}
