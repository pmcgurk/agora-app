import Link from "next/link";
import { login } from "@/app/actions/auth";
import Flash from "@/components/Flash";
import { buttonClass, cardClass, inputClass, linkClass } from "@/components/ui";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <div className={`${cardClass} space-y-5 p-6 sm:p-8`}>
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold text-text">Welcome back</h1>
          <p className="text-sm text-muted">Log in to continue.</p>
        </div>
        <Flash notice={notice} error={error} />
        <form action={login} className="space-y-4">
          <label className="block space-y-1 text-sm font-medium">
            Email
            <input name="email" type="email" required autoFocus autoComplete="email" className={inputClass} />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Password
            <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
          </label>
          <button className={`${buttonClass} w-full text-center`}>Log in</button>
          <p className="text-center text-sm">
            <Link href="/forgot-password" className={linkClass}>Forgot your password?</Link>
          </p>
        </form>
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className={linkClass}>
          Create an account
        </Link>
      </p>
    </main>
  );
}
