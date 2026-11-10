import Link from "next/link";
import { confirmEmail } from "@/app/actions/account";
import { buttonClass, cardClass, linkClass } from "@/components/ui";
import { findEmailToken } from "@/lib/email-tokens";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, referrer: "no-referrer" as const };

// Opening the link only shows a button. Confirming needs a click, because mail scanners open every link in a message.
export default async function ConfirmEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = (await findEmailToken(token, "VERIFY_EMAIL")) !== null;

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <div className={`${cardClass} space-y-5 p-6 sm:p-8`}>
        <h1 className="font-heading text-2xl font-bold text-text">Confirm your email</h1>
        {valid ? (
          <form action={confirmEmail} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <p className="text-sm text-muted">One click and your address is confirmed.</p>
            <button className={`${buttonClass} w-full text-center`}>Confirm my email</button>
          </form>
        ) : (
          <p role="note" className="rounded-theme bg-secondary p-3 text-sm">
            This link has expired or was already used.{" "}
            <Link href="/verify-email" className={linkClass}>Get a new one</Link>.
          </p>
        )}
      </div>
    </main>
  );
}
