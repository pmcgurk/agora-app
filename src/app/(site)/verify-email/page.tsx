import Link from "next/link";
import { resendVerification } from "@/app/actions/account";
import Flash from "@/components/Flash";
import { buttonClass, cardClass, linkClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const user = await getCurrentUser();

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <div className={`${cardClass} space-y-5 p-6 sm:p-8`}>
        <h1 className="font-heading text-2xl font-bold text-text">Confirm your email</h1>
        <Flash error={error} notice={notice} />
        {!user ? (
          <p className="text-sm">
            <Link href="/login" className={linkClass}>Log in</Link> to send yourself a new confirmation link.
          </p>
        ) : user.emailVerifiedAt ? (
          <p className="text-sm text-muted">Your email address, {user.email}, is confirmed.</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              We sent a link to <strong className="text-text">{user.email}</strong>. Open it to confirm your address, so you can comment
              and send messages.
            </p>
            <form action={resendVerification}>
              <button className={`${buttonClass} w-full text-center`}>Send me a new link</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
