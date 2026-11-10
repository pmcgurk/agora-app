import Link from "next/link";
import Flash from "@/components/Flash";
import { linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { creatorPath } from "@/lib/creator";
import { formatMoney } from "@/lib/currency";
import { countUnpublished } from "@/lib/publishing";
import { formatBytes, getCreatorStats } from "@/lib/stats";
import { PatronOverview } from "./patron-overview";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const user = await requireUser();
  const { error, notice } = await searchParams;
  if (user.role !== "CREATOR") return <PatronOverview user={user} error={error} notice={notice} />;

  const [stats, unpublished] = await Promise.all([getCreatorStats(user.id), countUnpublished(user.id)]);
  const cards: [string, string | number][] = [
    ["Members", stats.followers],
    ["Paying", stats.paidSubscribers],
    ["Gifted", stats.giftedSubscribers],
    ["Monthly revenue", formatMoney(stats.monthlyRevenueCents, user.currency)],
    ["Posts", stats.postCount],
    ["Storage", `${stats.mediaCount} ${stats.mediaCount === 1 ? "file" : "files"} · ${formatBytes(stats.storageBytes)}`],
  ];

  return (
    <>
      <h1 className="text-3xl font-bold text-primary">Overview</h1>
      <Flash notice={notice} error={error} />
      {unpublished.drafts + unpublished.scheduled > 0 && (
        <section aria-label="Unpublished posts" className="agora-card rounded-theme border-2 border-dashed border-primary/50 bg-secondary p-4">
          <p className="font-semibold">
            {[
              unpublished.drafts > 0 && `${unpublished.drafts} ${unpublished.drafts === 1 ? "draft" : "drafts"}`,
              unpublished.scheduled > 0 && `${unpublished.scheduled} scheduled`,
            ]
              .filter(Boolean)
              .join(" and ")}
          </p>
          <p className="text-sm text-muted">Only you can see these.</p>
          <p className="mt-1">
            <Link href="/dashboard/posts" className={linkClass}>Review them →</Link>
          </p>
        </section>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map(([label, value]) => (
          <div key={label} className="agora-card rounded-theme border border-line bg-surface p-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-xl font-semibold text-primary">{value}</dd>
          </div>
        ))}
      </dl>
      <p>
        <Link href={creatorPath(user)} className={linkClass}>View your page</Link>
      </p>
    </>
  );
}
