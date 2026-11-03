import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { buttonClass, inputClass, linkClass } from "@/components/ui";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm space-y-4 px-4 py-16">
      <h1 className="text-2xl font-bold text-primary">Create your account</h1>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <form action={signup} className="space-y-3">
        <label className="block">
          Name
          <input name="name" required maxLength={100} autoComplete="name" className={inputClass} />
        </label>
        <label className="block">
          Email
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </label>
        <label className="block">
          Password (10+ characters)
          <input name="password" type="password" required minLength={10} autoComplete="new-password" className={inputClass} />
        </label>
        <button className={buttonClass}>Sign up</button>
      </form>
      <p>
        Already registered? <Link href="/login" className={linkClass}>Log in</Link>
      </p>
    </main>
  );
}
