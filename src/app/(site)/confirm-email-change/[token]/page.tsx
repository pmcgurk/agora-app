import Link from "next/link";
import { confirmEmailChange } from "@/app/actions/account";
import { buttonClass, cardClass, linkClass } from "@/components/ui";
import { findEmailToken } from "@/lib/email-tokens";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, referrer: "no-referrer" as const };

// Opening the link only shows a button. Confirming needs a click, because mail scanners open every link in a message.
export default async function ConfirmEmailChangePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findEmailToken(token, "EMAIL_CHANGE");

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <div className={`${cardClass} space-y-5 p-6 sm:p-8`}>
        <h1 className="font-heading text-2xl font-bold text-text">Use this email address</h1>
        {found?.payload ? (
          <form action={confirmEmailChange} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <p className="text-sm text-muted">
              Confirm that <strong className="text-text">{found.payload}</strong> should be the address for your account. You will be
              signed out everywhere and asked to log in again.
            </p>
            <button className={`${buttonClass} w-full text-center`}>Confirm the change</button>
          </form>
        ) : (
          <p role="note" className="rounded-theme bg-secondary p-3 text-sm">
            This link has expired or was already used. You can ask for a new one in <Link href="/settings/account" className={linkClass}>Settings</Link>.
          </p>
        )}
      </div>
    </main>
  );
}
