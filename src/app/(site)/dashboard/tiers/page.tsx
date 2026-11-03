import Link from "next/link";
import { createTier, deleteTier, setTierActive, updateTier } from "@/app/actions/settings";
import Flash from "@/components/Flash";
import { buttonClass, inputClass, linkClass } from "@/components/ui";
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

  return (
    <>
      <h1 className="text-3xl font-bold text-primary">Tiers</h1>
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

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Edit tiers</h2>
        {stats.tiers.map((tier) => (
          <form key={tier.id} action={updateTier} className="agora-card flex flex-wrap items-end gap-3 rounded-theme border border-line bg-surface p-3">
            <input type="hidden" name="tierId" value={tier.id} />
            <label>
              Name
              <input name="name" required maxLength={60} defaultValue={tier.name} className={inputClass} />
            </label>
            {tier.price > 0 ? (
              <label>
                Price / month
                <input name="price" type="number" min="1" max="1000" step="0.01" required defaultValue={(tier.price / 100).toFixed(2)} className={inputClass} />
              </label>
            ) : (
              <span className="pb-2 text-muted">Free</span>
            )}
            <label className="w-full">
              Description
              <textarea name="description" rows={2} maxLength={400} defaultValue={tier.description ?? ""} className={inputClass} />
            </label>
            <button className={buttonClass}>Save</button>
            {tier.price > 0 && (
              <>
                <span className="pb-2 text-sm text-muted">{tier.active ? "On" : "Off (no new members)"}</span>
                <button
                  formAction={setTierActive}
                  name="active"
                  value={tier.active ? "0" : "1"}
                  className={buttonClass}
                >
                  {tier.active ? "Turn off" : "Turn on"}
                </button>
                <button formAction={deleteTier} className={buttonClass}>Delete</button>
              </>
            )}
          </form>
        ))}
      </section>

      {user.acceptsPayments && (await paymentMode()) !== "off" ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">New tier</h2>
          <form action={createTier} className="flex flex-wrap items-end gap-3">
            <label>
              Name
              <input name="name" required maxLength={60} className={inputClass} />
            </label>
            <label>
              Price / month ({user.currency})
              <input name="price" type="number" min="1" max="1000" step="0.01" required className={inputClass} />
            </label>
            <label className="w-full">
              Description
              <textarea name="description" rows={2} maxLength={400} className={inputClass} />
            </label>
            <button className={buttonClass}>Add tier</button>
          </form>
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
