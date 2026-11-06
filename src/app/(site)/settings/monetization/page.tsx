import Link from "next/link";
import { removeStripeKeys, saveCurrency, savePayments, saveStripeKeys, saveTips } from "@/app/actions/settings";
import Flash from "@/components/Flash";
import { buttonClass, inputClass, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CURRENCIES } from "@/lib/currency";
import { getStripeConfig, paymentMode } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default async function CurrencySettings({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser("CREATOR");
  const { notice, error } = await searchParams;
  const stripe = await getStripeConfig();
  const mode = await paymentMode();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://your-domain";

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
      <h2 className="text-xl font-semibold">Stripe</h2>
      <p className="text-sm text-muted">
        {stripe.source === "settings" && "Stripe is connected using keys saved here."}
        {stripe.source === "env" && "Stripe is connected using the server's STRIPE_SECRET_KEY environment variable. Saving a key here overrides it."}
        {stripe.source === null && "Stripe is not connected yet. Paste your keys to enable paid tiers."}
        {stripe.secretKey && ` Current key: …${stripe.secretKey.slice(-4)}`}
      </p>
      <form action={saveStripeKeys} className="space-y-3">
        <label className="block">
          Secret key (sk_… or rk_…)
          <input name="stripeSecretKey" type="password" autoComplete="off" placeholder={stripe.secretKey ? "Leave blank to keep the current key" : "sk_live_…"} className={inputClass} />
        </label>
        <label className="block">
          Webhook signing secret (whsec_…)
          <input name="stripeWebhookSecret" type="password" autoComplete="off" placeholder={stripe.webhookSecret ? "Leave blank to keep the current secret" : "whsec_…"} className={inputClass} />
        </label>
        <p className="text-sm text-muted">
          In Stripe, create a webhook endpoint pointing at <code>{baseUrl}/api/stripe/webhook</code> with the events
          checkout.session.completed, checkout.session.async_payment_succeeded, invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted and charge.refunded. If your Stripe account has Managed Payments turned on, Agora sends the tax code it requires, so checkout works either way.
        </p>
        <div className="flex gap-3">
          <button className={buttonClass}>Save Stripe keys</button>
          {stripe.source === "settings" && <button formAction={removeStripeKeys} className={buttonClass}>Remove keys</button>}
        </div>
      </form>
      <h2 className="text-xl font-semibold">Paid tiers</h2>
      {mode === "off" ? (
        <p className="text-muted">
          No payment provider is configured on this instance, so only free followers are available. Add your Stripe keys above to enable paid tiers.
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
      <h2 className="text-xl font-semibold">Tips</h2>
      {mode === "off" ? (
        <p className="text-muted">Add your Stripe keys above to accept tips.</p>
      ) : (
        <form action={saveTips} className="space-y-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="tipsEnabled" defaultChecked={user.tipsEnabled} />
            Let anyone send me one-off tips, no account needed
          </label>
          <p className="text-sm text-muted">
            Tips can be anonymous and appear under Payments on the Members page, where you can refund them.
          </p>
          <button className={buttonClass}>Save</button>
        </form>
      )}
    </section>
  );
}
