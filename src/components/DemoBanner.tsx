import Link from "next/link";
import { demoResetMinutes, isDemoMode } from "@/lib/demo";

// A slim bar across the top of every page of a demo instance: it says what this is and links back to
// the page where visitors choose how to look around.
export default function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div role="region" aria-label="Demo notice" className="border-b border-line bg-secondary px-4 py-2 text-center text-sm text-text">
      <strong>Live demo.</strong> The creator here is fictional and the site resets every {demoResetMinutes()} minutes.{" "}
      <Link href="/demo" className="agora-link text-primary underline">Choose a view</Link>
      {" · "}
      <a href="https://github.com/pmcgurk/agora-app" target="_blank" rel="noopener noreferrer" className="agora-link text-primary underline">Get Agora</a>
    </div>
  );
}
