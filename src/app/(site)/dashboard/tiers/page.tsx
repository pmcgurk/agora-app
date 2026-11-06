import Link from "next/link";
import { createTier, deleteTier, setTierActive, updateTier } from "@/app/actions/settings";
import ConfirmAction from "@/components/ConfirmAction";
import Flash from "@/components/Flash";
import TierEditor from "@/components/TierEditor";
import { linkClass, secondaryButtonClass } from "@/components/ui";
import { supportPath } from "@/lib/creator";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/currency";
import { paymentMode } from "@/lib/payments";
import { getCreatorStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function TiersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const user = await requireUser("CREATOR");
  const { error, notice } = await searchParams;
  const stats = await getCreatorStats(user.id);
  const money = (cents: number) => formatMoney(cents, user.currency);
  const canAddPaid = user.acceptsPayments && (await paymentMode()) !== "off";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-primary">Tiers</h1>
          <p className="text-sm text-muted">
            Design each tier here, or <Link href={`${await supportPath(user)}?edit=1`} className={linkClass}>edit them on your support page</Link>.
          </p>
        </div>
      </div>
      <Flash notice={notice} error={error} />

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-muted">
            <th className="py-1">Tier</th>
            <th>Price</th>
            <th>Members</th>
            <th>Gifted</th>
            <th>Monthly</th>
          </tr>
        </thead>
        <tbody>
          {stats.perTier.map((row) => (
            <tr key={row.tier.id} className="border-t border-line">
              <td className="py-1.5">{row.tier.name}</td>
              <td>{row.tier.price === 0 ? "Free" : `${money(row.tier.price)}/mo`}</td>
              <td>{row.members}</td>
              <td>{row.gifted}</td>
              <td>{money(row.monthlyCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="space-y-6">
        <h2 className="text-xl font-semibold">Edit tiers</h2>
        {stats.tiers.map((tier) => {
          const members = stats.perTier.find((entry) => entry.tier.id === tier.id)?.members ?? 0;
          const paid = tier.price > 0;
          return (
            <div key={tier.id} className="space-y-2">
              <p className="text-sm text-muted">
                {members} {members === 1 ? "member" : "members"}
                {paid && (tier.active ? " · accepting new members" : " · closed to new members")}
              </p>
              <TierEditor
                tier={{
                  id: tier.id,
                  name: tier.name,
                  price: tier.price,
                  description: tier.description,
                  perks: tier.perks,
                  badge: tier.badge,
                  highlighted: tier.highlighted,
                  active: tier.active,
                }}
                currency={user.currency}
                action={updateTier}
                extra={
                  paid && (
                    <>
                      <button formAction={setTierActive} name="active" value={tier.active ? "0" : "1"} className={secondaryButtonClass}>
                        {tier.active ? "Close to new members" : "Accept new members"}
                      </button>
                    </>
                  )
                }
              />
              {paid && (
                <div className="text-right">
                  <ConfirmAction
                    action={deleteTier}
                    fields={{ tierId: tier.id }}
                    label="Delete this tier"
                    message={`Delete ${tier.name}? This can't be undone.`}
                    confirmLabel="Yes, delete"
                  />
                </div>
              )}
            </div>
          );
        })}
      </section>

      {canAddPaid ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">New tier</h2>
          <TierEditor currency={user.currency} action={createTier} creating />
        </section>
      ) : (
        <p className="text-muted">
          You&apos;re only offering free followers. <Link href="/settings/monetization" className={linkClass}>Turn on payments</Link> to add paid tiers.
        </p>
      )}
      <p>
        <Link href="/settings/monetization" className={linkClass}>Change currency</Link>
      </p>
    </>
  );
}
