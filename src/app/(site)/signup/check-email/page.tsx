import Link from "next/link";
import { cardClass, linkClass } from "@/components/ui";

export const dynamic = "force-dynamic";

// The same page for every address, registered or not.
export default function CheckEmailPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <div className={`${cardClass} space-y-4 p-6 sm:p-8`}>
        <h1 className="font-heading text-2xl font-bold text-text">Check your email</h1>
        <p className="text-sm">
          If we can send mail to that address, we have. It holds a link to choose a password and finish signing up. The link works
          once and expires in 24 hours.
        </p>
        <p className="text-sm text-muted">Nothing arrived? Check your spam folder, or wait a few minutes and try again.</p>
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account? <Link href="/login" className={linkClass}>Log in</Link>
      </p>
    </main>
  );
}
