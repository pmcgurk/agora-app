import { changePassword } from "@/app/actions/settings";
import Flash from "@/components/Flash";
import { buttonClass, inputClass } from "@/components/ui";
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
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Account</h2>
      <Flash notice={notice} error={error} />
      <p>Signed in as <strong>{user.email}</strong></p>
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
    </section>
  );
}
