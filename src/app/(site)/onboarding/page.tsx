import { redirect } from "next/navigation";
import { finishOnboarding, saveOnboardingProfile, skipOnboarding } from "@/app/actions/onboarding";
import Flash from "@/components/Flash";
import Logo from "@/components/Logo";
import WizardSteps from "@/components/WizardSteps";
import { buttonClass, cardClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CURRENCIES } from "@/lib/currency";
import { paymentMode } from "@/lib/payments";
import { WIZARD_STEPS } from "@/lib/profile-fields";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; step?: string }>;
}) {
  const user = await requireUser("CREATOR");
  if (user.onboardedAt) redirect("/dashboard");
  const { error, step } = await searchParams;
  const payments = step === "payments";

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <h1 className="text-center"><Logo className="text-4xl" /></h1>
      <WizardSteps steps={WIZARD_STEPS} current={payments ? 2 : 1} />
      <section className={`${cardClass} space-y-4`}>
        <Flash error={error} />
        {payments ? <PaymentsStep currency={user.currency} /> : <ProfileStep user={user} />}
        <form action={skipOnboarding}>
          <button className="text-sm text-muted underline">Skip setup for now</button>
        </form>
      </section>
    </main>
  );
}

function ProfileStep({ user }: { user: { name: string; slug: string | null; tagline: string | null; bio: string | null; fediverseHandle: string | null } }) {
  return (
    <>
      <header>
        <h2 className="text-2xl font-bold text-primary">Set up your page</h2>
        <p className="text-muted">This is what your visitors see. You can change it any time in Settings.</p>
      </header>
      <form action={saveOnboardingProfile} className="space-y-3">
        <label className="block">
          Name
          <input name="name" required maxLength={100} defaultValue={user.name} className={inputClass} />
        </label>
        <label className="block">
          Page name (your address: /creators/<em>page-name</em>)
          <input name="slug" maxLength={30} pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]" defaultValue={user.slug ?? ""} className={inputClass} />
        </label>
        <label className="block">
          Tagline
          <input name="tagline" maxLength={120} defaultValue={user.tagline ?? ""} className={inputClass} />
        </label>
        <label className="block">
          About
          <textarea name="bio" rows={4} maxLength={2000} defaultValue={user.bio ?? ""} className={inputClass} />
        </label>
        <label className="block">
          Fediverse handle (optional)
          <input name="fediverseHandle" placeholder="@name@example.social" defaultValue={user.fediverseHandle ?? ""} className={inputClass} />
        </label>
        <button className={buttonClass}>Continue</button>
      </form>
    </>
  );
}

function PaymentsStep({ currency }: { currency: string }) {
  const available = paymentMode() !== "off";
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
            No payment provider is configured on this instance, so you will start with followers only. Set{" "}
            <code>STRIPE_SECRET_KEY</code>, then enable paid tiers in Settings &gt; Monetization.
          </p>
        )}
        <div className="flex gap-3">
          <a href="/onboarding" className={secondaryButtonClass}>Back</a>
          <button className={buttonClass}>Finish setup</button>
        </div>
      </form>
    </>
  );
}
