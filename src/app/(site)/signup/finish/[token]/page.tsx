import Link from "next/link";
import { finishSignup } from "@/app/actions/auth";
import Flash from "@/components/Flash";
import { buttonClass, cardClass, inputClass, linkClass } from "@/components/ui";
import { findPendingSignup } from "@/lib/pending-signups";

export const dynamic = "force-dynamic";
// The link is a secret: keep it out of Referer headers and search results.
export const metadata = { robots: { index: false }, referrer: "no-referrer" as const };

export default async function FinishSignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ token }, { error }] = await Promise.all([params, searchParams]);
  const pending = await findPendingSignup(token);

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <div className={`${cardClass} space-y-5 p-6 sm:p-8`}>
        <h1 className="font-heading text-2xl font-bold text-text">Finish signing up</h1>
        <Flash error={error} />
        {pending ? (
          <form action={finishSignup} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <p className="text-sm text-muted">
              Choose a password for <strong className="text-text">{pending.email}</strong>.
            </p>
            <label className="block space-y-1 text-sm font-medium">
              Password (10+ characters)
              <input name="password" type="password" required minLength={10} autoFocus autoComplete="new-password" className={inputClass} />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Type it again
              <input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={inputClass} />
            </label>
            <button className={`${buttonClass} w-full text-center`}>Create my account</button>
          </form>
        ) : (
          <p role="note" className="rounded-theme bg-secondary p-3 text-sm">
            This link has expired or was already used. <Link href="/signup" className={linkClass}>Sign up again</Link> to get a new one.
          </p>
        )}
      </div>
    </main>
  );
}
