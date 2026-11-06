import Link from "next/link";
import { redirect } from "next/navigation";
import { applyForCreator } from "@/app/actions/creators";
import { buttonClass, cardClass, inputClass, linkClass } from "@/components/ui";
import { getCreatorSettings } from "@/lib/instance";

export const dynamic = "force-dynamic";

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const settings = await getCreatorSettings();
  if (!settings.multiCreator || settings.signup !== "APPROVAL") redirect("/signup");
  const { error, sent } = await searchParams;

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className={`${cardClass} space-y-5 p-6 sm:p-8`}>
        {sent ? (
          <>
            <h1 className="font-heading text-2xl font-bold text-text">Application received</h1>
            <p className="text-muted">
              The site owner reviews applications by hand. If you&apos;re approved we&apos;ll email you a link to
              sign in and set up your page.
            </p>
            <Link href="/" className={linkClass}>Back to the home page</Link>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="font-heading text-2xl font-bold text-text">Apply for a creator account</h1>
              <p className="text-sm text-muted">Tell us a little about your work. The owner reviews every application.</p>
            </div>
            {error && (
              <p role="alert" className="rounded-theme bg-danger/10 p-3 text-sm text-danger">
                {error}
              </p>
            )}
            <form action={applyForCreator} className="space-y-4">
              <label className="block space-y-1 text-sm font-medium">
                Name
                <input name="name" required maxLength={100} autoComplete="name" autoFocus className={inputClass} />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Email
                <input name="email" type="email" required autoComplete="email" className={inputClass} />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Page name you&apos;d like
                <span className="block text-xs font-normal text-muted">Your page would be at /creators/page-name.</span>
                <input name="slug" required maxLength={30} pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]" className={inputClass} />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                What will you make? <span className="font-normal text-muted">(optional)</span>
                <textarea name="about" rows={4} maxLength={1000} className={inputClass} />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Password
                <span className="block text-xs font-normal text-muted">At least 10 characters. You&apos;ll use it once approved.</span>
                <input name="password" type="password" required minLength={10} autoComplete="new-password" className={inputClass} />
              </label>
              <button className={`${buttonClass} w-full text-center`}>Send application</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
