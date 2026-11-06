import { notFound, redirect } from "next/navigation";
import SupportView from "@/components/SupportView";
import { getCurrentUser } from "@/lib/auth";
import { getCreator, supportPath } from "@/lib/creator";
import { getSiteCreator } from "@/lib/instance";

export const dynamic = "force-dynamic";

export default async function CreatorSupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string; edit?: string }>;
}) {
  const creator = await getCreator((await params).id);
  if (!creator) notFound();
  const query = await searchParams;

  // A single-creator site has one canonical support address: /support.
  const site = await getSiteCreator();
  if (site?.id === creator.id) {
    const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
    redirect(`/support${search.size ? `?${search}` : ""}`);
  }

  return (
    <SupportView
      creator={creator}
      viewer={await getCurrentUser()}
      supportHref={await supportPath(creator)}
      error={query.error}
      notice={query.notice}
      edit={query.edit}
    />
  );
}
