import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/account";
import Flash from "@/components/Flash";
import { buttonClass, cardClass, inputClass, linkClass } from "@/components/ui";
import { mailIsConfigured } from "@/lib/account-email";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  const canEmail = await mailIsConfigured();

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <div className={`${cardClass} space-y-5 p-6 sm:p-8`}>
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold text-text">Reset your password</h1>
          <p className="text-sm text-muted">We&apos;ll email you a link to choose a new one.</p>
        </div>
        <Flash error={error} />
        {sent ? (
          <p role="status" className="rounded-theme bg-secondary p-3 text-sm">
            If that address has an account, a reset link is on its way. It works once and expires in an hour. Check your spam folder if
            it doesn&apos;t arrive.
          </p>
        ) : canEmail ? (
          <form action={requestPasswordReset} className="space-y-4">
            <label className="block space-y-1 text-sm font-medium">
              Email
              <input name="email" type="email" required autoFocus autoComplete="email" className={inputClass} />
            </label>
            <button className={`${buttonClass} w-full text-center`}>Send reset link</button>
          </form>
        ) : (
          <p role="note" className="rounded-theme bg-secondary p-3 text-sm">
            This site can&apos;t send email, so it can&apos;t send reset links. Ask the person who runs it to reset your password. If that&apos;s
            you, the README explains how to get a reset link from the server.
          </p>
        )}
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        <Link href="/login" className={linkClass}>Back to log in</Link>
      </p>
    </main>
  );
}
