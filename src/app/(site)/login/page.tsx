import Link from "next/link";
import { login } from "@/app/actions/auth";
import { buttonClass, inputClass, linkClass } from "@/components/ui";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm space-y-4 px-4 py-16">
      <h1 className="text-2xl font-bold text-primary">Log in</h1>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <form action={login} className="space-y-3">
        <label className="block">
          Email
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </label>
        <label className="block">
          Password
          <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
        </label>
        <button className={buttonClass}>Log in</button>
      </form>
      <p>
        No account? <Link href="/signup" className={linkClass}>Sign up</Link>
      </p>
    </main>
  );
}
