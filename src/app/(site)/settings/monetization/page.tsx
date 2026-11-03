import Link from "next/link";
import { saveCurrency, savePayments } from "@/app/actions/settings";
import Flash from "@/components/Flash";
import { buttonClass, inputClass, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CURRENCIES } from "@/lib/currency";
import { paymentMode } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default async function CurrencySettings({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser("CREATOR");
  const { notice, error } = await searchParams;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Currency</h2>
      <Flash notice={notice} error={error} />
      <form action={saveCurrency} className="flex flex-wrap items-end gap-3">
        <label>
          Currency
          <select name="currency" defaultValue={user.currency} className={inputClass}>
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>{currency.code} — {currency.label}</option>
            ))}
          </select>
        </label>
        <button className={buttonClass}>Save</button>
      </form>
      <h2 className="text-xl font-semibold">Paid tiers</h2>
      {paymentMode() === "off" ? (
        <p className="text-muted">
          No payment provider is configured on this instance, so only free followers are available. Set <code>STRIPE_SECRET_KEY</code> to enable paid tiers.
        </p>
      ) : (
        <form action={savePayments} className="space-y-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="acceptsPayments" defaultChecked={user.acceptsPayments} />
            Accept payments and offer paid tiers
          </label>
          <button className={buttonClass}>Save</button>
        </form>
      )}
      <p>
        <Link href="/dashboard/tiers" className={linkClass}>Manage tiers</Link>
      </p>
    </section>
  );
}
