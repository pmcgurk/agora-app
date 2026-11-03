import Link from "next/link";
import Flash from "@/components/Flash";
import { linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { creatorPath } from "@/lib/creator";
import { formatMoney } from "@/lib/currency";
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

  const stats = await getCreatorStats(user.id);
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
