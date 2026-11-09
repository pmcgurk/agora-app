import { cookies } from "next/headers";
import Link from "next/link";
import { demoResetMinutes, isDemoMode } from "@/lib/demo";
import { DEMO_NOTICE_COOKIE } from "@/lib/demo-guard";

// A slim bar across the top of every page of a demo instance: it says what this is and links back to
// the page where visitors choose how to look around. After a blocked change it also explains why
// nothing happened.
export default async function DemoBanner() {
  if (!isDemoMode()) return null;
  const blocked = (await cookies()).has(DEMO_NOTICE_COOKIE);
  return (
    <div role="region" aria-label="Demo notice" className="border-b border-line bg-secondary px-4 py-2 text-center text-sm text-text">
      {blocked && (
        <p role="alert" className="mb-1 font-semibold text-danger">
          This demo is read-only, so that change wasn&apos;t saved. On your own Agora it would be.
        </p>
      )}
      <strong>Live demo.</strong> The creator here is fictional and you can look around but not change anything.
      It refreshes every {demoResetMinutes()} minutes.{" "}
      <Link href="/demo" className="agora-link text-primary underline">Choose a view</Link>
      {" · "}
      <a href="https://github.com/pmcgurk/agora-app" target="_blank" rel="noopener noreferrer" className="agora-link text-primary underline">Get Agora</a>
    </div>
  );
}
