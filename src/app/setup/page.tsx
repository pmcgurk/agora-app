import { redirect } from "next/navigation";
import { setupInstance } from "@/app/actions/onboarding";
import Flash from "@/components/Flash";
import Logo from "@/components/Logo";
import WizardSteps from "@/components/WizardSteps";
import { buttonClass, cardClass, inputClass } from "@/components/ui";
import { needsSetup } from "@/lib/instance";
import { WIZARD_STEPS } from "@/lib/profile-fields";

export const dynamic = "force-dynamic";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await needsSetup())) redirect("/login");
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
          <button className={`${buttonClass} w-full`}>Create account</button>
        </form>
      </section>
    </main>
  );
}
