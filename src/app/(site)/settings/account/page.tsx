import { changePassword, deleteAccount, requestEmailChange } from "@/app/actions/settings";
import Flash from "@/components/Flash";
import { buttonClass, cardClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AccountSettings({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { notice, error } = await searchParams;
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Account</h2>
        <Flash notice={notice} error={error} />
        <p>Signed in as <strong>{user.email}</strong></p>
      </div>

      <form action={requestEmailChange} className="space-y-4">
        <h3 className="font-semibold">Change email</h3>
        <label className="block">
          New email address
          <input name="newEmail" type="email" required autoComplete="email" className={inputClass} />
        </label>
        <label className="block">
          Your password
          <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
        </label>
        <button className={buttonClass}>Change email</button>
      </form>

      <form action={changePassword} className="space-y-4">
        <h3 className="font-semibold">Change password</h3>
        <label className="block">
          Current password
          <input name="currentPassword" type="password" required autoComplete="current-password" className={inputClass} />
        </label>
        <label className="block">
          New password (at least 10 characters)
          <input name="newPassword" type="password" required minLength={10} autoComplete="new-password" className={inputClass} />
        </label>
        <label className="block">
          Confirm new password
          <input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" className={inputClass} />
        </label>
        <button className={buttonClass}>Change password</button>
      </form>

      <div className="space-y-2">
        <h3 className="font-semibold">Download your data</h3>
        <p className="text-sm text-muted">
          Everything held about this account (your details, memberships, payments, comments, likes and messages) as one file.
          Passwords and other people&apos;s email addresses are not in it.
        </p>
        <a href="/api/account/export" className={secondaryButtonClass}>Download my data</a>
      </div>

      <div className={`${cardClass} space-y-3 border-danger/40`}>
        <h3 className="font-semibold text-danger">Delete your account</h3>
        {user.role === "CREATOR" ? (
          <p className="text-sm text-muted">
            Deleting a creator account would delete the whole page with its posts and members, so it can&apos;t be done from here.
            Download your data above if you want a copy, and ask whoever runs the server to remove the site.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              This permanently deletes your account, memberships, likes and messages, and cancels any paid membership. Comments that
              other people replied to stay as &quot;[deleted]&quot;; the rest are removed. It cannot be undone.
            </p>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-danger">I want to delete my account</summary>
              <form action={deleteAccount} className="mt-3 space-y-3">
                <label className="block">
                  Your password
                  <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="confirm" required className="mt-1" />
                  <span>Yes, permanently delete my account.</span>
                </label>
                <button className="inline-block rounded-theme bg-danger px-4 py-2 font-medium text-white hover:opacity-90">Delete my account</button>
              </form>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
