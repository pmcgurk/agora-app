import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { buttonClass, cardClass, inputClass, linkClass } from "@/components/ui";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <div className={`${cardClass} space-y-5 p-6 sm:p-8`}>
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold text-text">Create your account</h1>
          <p className="text-sm text-muted">Follow creators and support the work you love.</p>
        </div>
        {error && (
          <p role="alert" className="rounded-theme bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <form action={signup} className="space-y-4">
          <label className="block space-y-1 text-sm font-medium">
            Name
            <input name="name" required autoFocus maxLength={100} autoComplete="name" className={inputClass} />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Email
            <input name="email" type="email" required autoComplete="email" className={inputClass} />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Password
            <span className="block text-xs font-normal text-muted">At least 10 characters.</span>
            <input name="password" type="password" required minLength={10} autoComplete="new-password" className={inputClass} />
          </label>
          <button className={`${buttonClass} w-full text-center`}>Sign up</button>
        </form>
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        Already registered?{" "}
        <Link href="/login" className={linkClass}>
          Log in
        </Link>
      </p>
    </main>
  );
}
