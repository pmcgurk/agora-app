import { redirect } from "next/navigation";
import { setupInstance } from "@/app/actions/onboarding";
import Flash from "@/components/Flash";
import Logo from "@/components/Logo";
import WizardSteps from "@/components/WizardSteps";
import { buttonClass, cardClass, inputClass } from "@/components/ui";
import { isDemoMode } from "@/lib/demo";
import { setupLooksPublicAndOpen, setupTokenRequired } from "@/lib/setup-token";
import { needsSetup } from "@/lib/instance";
import { WIZARD_STEPS } from "@/lib/profile-fields";

export const dynamic = "force-dynamic";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const demo = isDemoMode();
  if (!demo && !(await needsSetup())) redirect("/login");
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-14">
      <h1 className="text-center"><Logo className="text-5xl" /></h1>
      <WizardSteps steps={WIZARD_STEPS} current={0} />
      <section className={`${cardClass} space-y-4`}>
        <header>
          <h2 className="text-2xl font-bold text-primary">Welcome to Agora</h2>
          <p className="text-muted">Create the owner account for this site. It takes about a minute.</p>
        </header>
        <Flash error={error} />
        {demo && (
          <p role="note" className="rounded-theme bg-secondary p-3 text-sm">
            <strong>Demo.</strong> This is the real first screen of a new Agora site. Type anything you like: nothing is
            saved, and you&apos;ll be signed in as the fictional demo creator for the next steps.
          </p>
        )}
        {!demo && setupLooksPublicAndOpen() && (
          <p role="note" className="rounded-theme bg-secondary p-3 text-sm">
            <strong>Heads up:</strong> the first person to finish this form owns the site, and this page is open to anyone who can reach
            it. If you are not setting up right now, set a <code>SETUP_TOKEN</code> in the server&apos;s environment to lock it.
          </p>
        )}
        <form action={setupInstance} className="space-y-3">
          <label className="block">
            Your name
            <input name="name" required maxLength={100} autoComplete="name" autoFocus className={inputClass} />
          </label>
          <label className="block">
            Email
            <input name="email" type="email" required autoComplete="email" className={inputClass} />
          </label>
          <label className="block">
            Password (10+ characters)
            <input name="password" type="password" required minLength={10} autoComplete="new-password" className={inputClass} />
          </label>
          {!demo && setupTokenRequired() && (
            <label className="block">
              Setup token
              <input name="setupToken" type="password" required autoComplete="off" className={inputClass} />
              <span className="block text-sm text-muted">The SETUP_TOKEN value from this server&apos;s environment. It proves you run this site.</span>
            </label>
          )}
          <button className={`${buttonClass} w-full`}>Create account</button>
        </form>
      </section>
    </main>
  );
}
