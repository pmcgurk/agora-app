import Link from "next/link";
import { redirect } from "next/navigation";
import { finishOnboarding, saveOnboardingProfile, saveOnboardingStripe, skipOnboarding } from "@/app/actions/onboarding";
import Flash from "@/components/Flash";
import Logo from "@/components/Logo";
import WizardSteps from "@/components/WizardSteps";
import { buttonClass, cardClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CURRENCIES } from "@/lib/currency";
import { isDemoMode } from "@/lib/demo";
import { paymentMode } from "@/lib/payments";
import { publicUrl } from "@/lib/urls";
import { WIZARD_STEPS } from "@/lib/profile-fields";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; step?: string }>;
}) {
  const user = await requireUser("CREATOR");
  const demo = isDemoMode();
  // The demo replays the wizard for every visitor, even though its creator is already set up.
  if (user.onboardedAt && !demo) redirect("/dashboard");
  const { error, notice, step } = await searchParams;
  const payments = step === "payments";
  // A demo wizard starts from blank fields, like a brand-new site would.
  const person = demo ? { name: "", tagline: null, bio: null } : user;

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <h1 className="text-center"><Logo className="text-4xl" /></h1>
      <WizardSteps steps={WIZARD_STEPS} current={payments ? 2 : 1} />
      <section className={`${cardClass} space-y-4`}>
        {demo && (
          <p role="note" className="rounded-theme bg-secondary p-3 text-sm">
            <strong>Demo.</strong> Nothing you enter in this wizard is saved.
          </p>
        )}
        <Flash error={error} notice={notice} />
        {payments ? (
          <PaymentsStep currency={user.currency} demo={demo} />
        ) : (
          <ProfileStep user={person} />
        )}
        <form action={skipOnboarding}>
          <button className="text-sm text-muted underline">Skip setup for now</button>
        </form>
      </section>
    </main>
  );
}

function ProfileStep({
  user,
}: {
  user: { name: string; tagline: string | null; bio: string | null };
}) {
  return (
    <>
      <header>
        <h2 className="text-2xl font-bold text-primary">Set up your page</h2>
        <p className="text-muted">This is what your visitors see. You can change it any time in Settings.</p>
      </header>
      <form action={saveOnboardingProfile} className="space-y-4">
        <label className="block space-y-1 text-sm font-medium">
          Name
          <input name="name" required maxLength={100} defaultValue={user.name} className={inputClass} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Tagline
          <input name="tagline" maxLength={120} placeholder="A line about what you make" defaultValue={user.tagline ?? ""} className={inputClass} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          About
          <textarea name="bio" rows={4} maxLength={2000} defaultValue={user.bio ?? ""} className={inputClass} />
        </label>
        <button className={buttonClass}>Continue</button>
      </form>
    </>
  );
}

async function PaymentsStep({ currency, demo }: { currency: string; demo: boolean }) {
  // The demo shows the not-connected-yet view, so visitors see the Stripe tutorial.
  const available = !demo && (await paymentMode()) !== "off";
  return (
    <>
      <header>
        <h2 className="text-2xl font-bold text-primary">Payments</h2>
        <p className="text-muted">
          Optional. Everyone can follow you for free; turn on payments to also offer paid tiers.
        </p>
      </header>
      <form action={finishOnboarding} className="space-y-3">
        <label className="block">
          Currency
          <select name="currency" defaultValue={currency} className={inputClass}>
            {CURRENCIES.map((option) => (
              <option key={option.code} value={option.code}>{option.code} — {option.label}</option>
            ))}
          </select>
        </label>
        {available ? (
          <>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="acceptsPayments" />
              Accept payments and offer paid tiers
            </label>
            <fieldset className="space-y-3">
              <legend className="text-muted">Optionally add your first paid tier (needs the box above ticked)</legend>
              <label className="block">
                Tier name
                <input name="tierName" maxLength={60} className={inputClass} />
              </label>
              <label className="block">
                Price / month
                <input name="tierPrice" type="number" min="1" max="1000" step="0.01" className={inputClass} />
              </label>
              <label className="block">
                Description
                <textarea name="tierDescription" rows={2} maxLength={400} className={inputClass} />
              </label>
            </fieldset>
          </>
        ) : (
          <p role="note" className="rounded-theme bg-secondary p-3">
            Stripe isn&apos;t connected yet, so you will start with followers only. Connect it below (about five
            minutes), or finish now and do it later in Settings &rarr; Payments.
          </p>
        )}
        <div className="flex gap-3">
          <Link href="/onboarding" className={secondaryButtonClass}>Back</Link>
          <button className={buttonClass}>Finish setup</button>
        </div>
      </form>
      {!available && <StripeGuide demo={demo} />}
    </>
  );
}

function StripeGuide({ demo }: { demo: boolean }) {
  const webhook = publicUrl("/api/stripe/webhook");
  return (
    <details className="rounded-theme border border-line p-4" open>
      <summary className="cursor-pointer font-semibold">Connect Stripe to take payments</summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-muted">
          Stripe handles the cards and pays the money to your bank account. Agora never sees card details or holds
          your money, and takes no fee (Stripe&apos;s own card fees apply).
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Create a free account at <a href="https://dashboard.stripe.com/register" target="_blank" rel="noopener noreferrer" className="text-primary underline">dashboard.stripe.com</a>.
            Stay in <strong>Test mode</strong> (the toggle at the top) while you try things out.
          </li>
          <li>
            Go to <strong>Developers &rarr; API keys</strong> and copy the <strong>Secret key</strong> (starts with <code>sk_test_</code>).
          </li>
          <li>
            Go to <strong>Developers &rarr; Webhooks</strong> and add an endpoint pointing at <code className="break-all">{webhook}</code> with
            the events <code className="break-all">checkout.session.completed, checkout.session.async_payment_succeeded, invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted, charge.refunded</code>.
            Copy its <strong>Signing secret</strong> (starts with <code>whsec_</code>). Running on your own computer? Use the Stripe CLI instead:
            <code className="ml-1 break-all">stripe listen --forward-to localhost:3000/api/stripe/webhook</code>
          </li>
          <li>Paste both below. When you are ready for real money, switch Stripe to live mode and replace the keys in Settings &rarr; Payments. Set up your bank details under Stripe &rarr; Settings &rarr; Payouts.</li>
        </ol>
        <form action={saveOnboardingStripe} className="space-y-3">
          {demo && (
            <p role="note" className="rounded-theme bg-secondary p-3">
              <strong>Demo.</strong> Don&apos;t paste a real key here. These made-up values are only for show, and nothing is saved.
            </p>
          )}
          <label className="block">
            Secret key
            <input name="stripeSecretKey" type={demo ? "text" : "password"} autoComplete="off" placeholder="sk_test_…" defaultValue={demo ? "sk_test_demo12345678" : undefined} required className={inputClass} />
          </label>
          <label className="block">
            Webhook signing secret
            <input name="stripeWebhookSecret" type={demo ? "text" : "password"} autoComplete="off" placeholder="whsec_…" defaultValue={demo ? "whsec_demo12345678" : undefined} className={inputClass} />
          </label>
          <button className={secondaryButtonClass}>Save Stripe keys</button>
        </form>
      </div>
    </details>
  );
}
