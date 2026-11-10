import Link from "next/link";
import { resetPassword } from "@/app/actions/account";
import Flash from "@/components/Flash";
import { buttonClass, cardClass, inputClass, linkClass } from "@/components/ui";
import { findEmailToken } from "@/lib/email-tokens";

export const dynamic = "force-dynamic";
// The link is a secret: keep it out of Referer headers and search results.
export const metadata = { robots: { index: false }, referrer: "no-referrer" as const };

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ token }, { error }] = await Promise.all([params, searchParams]);
  const valid = (await findEmailToken(token, "PASSWORD_RESET")) !== null;

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <div className={`${cardClass} space-y-5 p-6 sm:p-8`}>
        <h1 className="font-heading text-2xl font-bold text-text">Choose a new password</h1>
        <Flash error={error} />
        {valid ? (
          <form action={resetPassword} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <label className="block space-y-1 text-sm font-medium">
              New password (10+ characters)
              <input name="password" type="password" required minLength={10} autoFocus autoComplete="new-password" className={inputClass} />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Type it again
              <input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={inputClass} />
            </label>
            <button className={`${buttonClass} w-full text-center`}>Change password</button>
            <p className="text-xs text-muted">Changing it signs you out everywhere else.</p>
          </form>
        ) : (
          <p role="note" className="rounded-theme bg-secondary p-3 text-sm">
            This link has expired or was already used.{" "}
            <Link href="/forgot-password" className={linkClass}>Ask for a new one</Link>.
          </p>
        )}
      </div>
    </main>
  );
}
