import { acceptInvite } from "@/app/actions/creators";
import Flash from "@/components/Flash";
import Logo from "@/components/Logo";
import { buttonClass, cardClass, inputClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { findOpenInvite } from "@/lib/invites";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const invite = await findOpenInvite(token);
  const viewer = await getCurrentUser();

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-14">
      <h1 className="text-center"><Logo className="text-4xl" /></h1>
      <section className={`${cardClass} space-y-4 p-6`}>
        {!invite ? (
          <>
            <h2 className="text-2xl font-bold text-text">This invite isn&apos;t valid</h2>
            <p className="text-muted">It may have expired, or it has already been used. Ask the site owner for a new one.</p>
          </>
        ) : viewer ? (
          <>
            <h2 className="text-2xl font-bold text-text">You&apos;ve been invited</h2>
            <p className="text-muted">
              You&apos;re signed in as {viewer.email}. Log out first to create the creator account for {invite.email}.
            </p>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-text">Join as a creator</h2>
              <p className="text-muted">
                Create your account to set up your page{invite.slug ? ` at /creators/${invite.slug}` : ""}.
              </p>
            </div>
            <Flash error={error} />
            <form action={acceptInvite} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <label className="block space-y-1 text-sm font-medium">
                Email
                <input value={invite.email} readOnly className={`${inputClass} opacity-70`} />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Your name
                <input name="name" required maxLength={100} defaultValue={invite.name} autoComplete="name" className={inputClass} />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Password
                <span className="block text-xs font-normal text-muted">At least 10 characters.</span>
                <input name="password" type="password" required minLength={10} autoComplete="new-password" className={inputClass} />
              </label>
              <button className={`${buttonClass} w-full text-center`}>Create creator account</button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
