import { notFound } from "next/navigation";
import SupportView from "@/components/SupportView";
import { getCurrentUser } from "@/lib/auth";
import { getSiteCreator } from "@/lib/instance";

export const dynamic = "force-dynamic";

// The support page of a single-creator site. Multi-creator sites have one per creator instead.
export default async function SiteSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; edit?: string }>;
}) {
  const creator = await getSiteCreator();
  if (!creator) notFound();
  const query = await searchParams;
  return (
    <SupportView
      creator={creator}
      viewer={await getCurrentUser()}
      supportHref="/support"
      error={query.error}
      notice={query.notice}
      edit={query.edit}
    />
  );
}
