import Link from "next/link";
import { redirect } from "next/navigation";
import { signup } from "@/app/actions/auth";
import { signupCreator } from "@/app/actions/creators";
import { buttonClass, cardClass, inputClass, linkClass } from "@/components/ui";
import { getCreatorSettings } from "@/lib/instance";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; as?: string }>;
}) {
  const { error, as } = await searchParams;
  const settings = await getCreatorSettings();
  const creatorsOpen = settings.multiCreator && settings.signup === "OPEN";
  const applications = settings.multiCreator && settings.signup === "APPROVAL";
  if (as === "creator" && !creatorsOpen) redirect("/signup");
  const creator = as === "creator" && creatorsOpen;

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <div className={`${cardClass} space-y-5 p-6 sm:p-8`}>
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold text-text">
            {creator ? "Create a creator account" : "Create your account"}
          </h1>
          <p className="text-sm text-muted">
            {creator ? "You'll get your own page to share work and take support." : "Follow creators and support the work you love."}
          </p>
        </div>
        {error && (
          <p role="alert" className="rounded-theme bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <form action={creator ? signupCreator : signup} className="space-y-4">
          <label className="block space-y-1 text-sm font-medium">
            Name
            <input name="name" required maxLength={100} autoComplete="name" autoFocus className={inputClass} />
          </label>
          {creator && (
            <label className="block space-y-1 text-sm font-medium">
              Page name
              <span className="block text-xs font-normal text-muted">Your page will be at /creators/page-name. Lowercase letters, numbers and hyphens.</span>
              <input name="slug" required maxLength={30} pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]" className={inputClass} />
            </label>
          )}
          <label className="block space-y-1 text-sm font-medium">
            Email
            <input name="email" type="email" required autoComplete="email" className={inputClass} />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Password
            <span className="block text-xs font-normal text-muted">At least 10 characters.</span>
            <input name="password" type="password" required minLength={10} autoComplete="new-password" className={inputClass} />
          </label>
          <button className={`${buttonClass} w-full text-center`}>{creator ? "Create creator account" : "Sign up"}</button>
        </form>
      </div>
      <div className="mt-4 space-y-2 text-center text-sm text-muted">
        {creator ? (
          <p>
            Want to follow creators instead? <Link href="/signup" className={linkClass}>Sign up as a patron</Link>
          </p>
        ) : (
          <>
            {creatorsOpen && (
              <p>
                Want your own page?{" "}
                <Link href="/signup?as=creator" className={linkClass}>Create a creator account</Link>
              </p>
            )}
            {applications && (
              <p>
                Want your own page?{" "}
                <Link href="/apply" className={linkClass}>Apply to be a creator</Link>
              </p>
            )}
          </>
        )}
        <p>
          Already registered? <Link href="/login" className={linkClass}>Log in</Link>
        </p>
      </div>
    </main>
  );
}
