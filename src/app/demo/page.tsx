import { notFound } from "next/navigation";
import { enterDemo } from "@/app/actions/demo";
import Flash from "@/components/Flash";
import Logo from "@/components/Logo";
import WaitlistForm from "@/components/WaitlistForm";
import { buttonClass, cardClass, secondaryButtonClass } from "@/components/ui";
import { demoResetMinutes, isDemoMode, waitlistEmail } from "@/lib/demo";

export const dynamic = "force-dynamic";

export const metadata = { title: "Try Agora", robots: { index: false } };

function ViewButton({ view, children, primary }: { view: string; children: string; primary?: boolean }) {
  return (
    <form action={enterDemo}>
      <input type="hidden" name="view" value={view} />
      <button className={`${primary ? buttonClass : secondaryButtonClass} w-full text-center`}>{children}</button>
    </form>
  );
}

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!isDemoMode()) notFound();
  const { error } = await searchParams;
  const contact = waitlistEmail();

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header className="space-y-3 text-center">
        <h1><Logo className="text-5xl" /></h1>
        <p className="text-xl font-semibold">Try it as a creator or as a supporter</p>
        <p className="text-muted">
          Agora is a self-hosted, open-source home for creators and their supporters: posts, paid tiers, tips and
          messages, on your own server. This demo runs a fictional ceramics creator, Maya.
        </p>
      </header>

      <Flash error={error} />

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Ways to look around">
        <div className={`${cardClass} flex flex-col gap-3`}>
          <h2 className="text-lg font-semibold">As a new creator</h2>
          <p className="flex-1 text-sm text-muted">
            Walk through the setup wizard exactly as someone starting a new site sees it: account, page details and
            payments, with the Stripe guide. Nothing you type in the wizard is saved.
          </p>
          <ViewButton view="wizard" primary>Start the setup wizard</ViewButton>
          <ViewButton view="dashboard">Skip to the dashboard</ViewButton>
        </div>
        <div className={`${cardClass} flex flex-col gap-3`}>
          <h2 className="text-lg font-semibold">As a supporter</h2>
          <p className="flex-1 text-sm text-muted">
            Priya backs Maya on the Studio Friend tier. Read the posts she can open, see the Maker Club posts that stay
            locked, and look at the tip and upgrade options.
          </p>
          <ViewButton view="supporter" primary>Browse as Priya</ViewButton>
        </div>
        <div className={`${cardClass} flex flex-col gap-3`}>
          <h2 className="text-lg font-semibold">As a visitor</h2>
          <p className="flex-1 text-sm text-muted">
            See the public page the way anyone arriving from a link would, signed out, with the follow and support
            buttons.
          </p>
          <ViewButton view="visitor" primary>Browse the public page</ViewButton>
        </div>
      </section>

      <section className={`${cardClass} space-y-2 text-sm text-muted`} aria-label="About the demo">
        <p>
          <strong className="text-text">The demo is read-only.</strong> You can look at everything, but posting,
          commenting, liking, tipping, uploading and changing settings are switched off, and no money moves. The data
          is refreshed every {demoResetMinutes()} minutes. On your own Agora, all of it works.
        </p>
      </section>

      {contact && (
        <section id="waitlist" className={`${cardClass} space-y-3`} aria-label="Hosted Agora waitlist">
          <h2 className="text-lg font-semibold">Want it hosted for you?</h2>
          <p className="text-sm text-muted">
            Agora is free to run yourself. I&apos;m thinking about a hosted version, where your own Agora site is set up
            and kept running for a flat monthly price, with no cut of what you earn. Join the waitlist to hear when it
            opens. It would not allow adult content.
          </p>
          <WaitlistForm contact={contact} />
        </section>
      )}

      <p className="text-center text-sm text-muted">
        <a href="https://github.com/pmcgurk/agora-app" target="_blank" rel="noopener noreferrer" className="agora-link text-primary underline">
          Source code and self-hosting guide on GitHub
        </a>
      </p>
    </main>
  );
}
