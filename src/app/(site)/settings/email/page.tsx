import { redirect } from "next/navigation";
import { clearMailSettings, sendTestMail } from "@/app/actions/mail";
import Flash from "@/components/Flash";
import MailSettingsForm from "@/components/MailSettingsForm";
import { cardClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isInstanceOwner } from "@/lib/instance";
import { mailSource } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EmailSettings({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser("CREATOR");
  if (!(await isInstanceOwner(user.id))) redirect("/settings/profile");
  const { notice, error } = await searchParams;
  const [row, source] = await Promise.all([
    prisma.instanceSetting.findUnique({ where: { id: "instance" } }),
    mailSource(),
  ]);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Email</h2>
        <p className="text-sm text-muted">
          Used for creator invites, creator applications and their decisions. Any SMTP server works: a
          mail provider, your hosting company, or a self-hosted relay.
        </p>
      </div>
      <Flash notice={notice} error={error} />

      <div className={`${cardClass} p-4 text-sm`}>
        {source === "database" && <p>Sending with the settings saved here.</p>}
        {source === "environment" && <p>Sending with the MAIL_* environment variables. Saving here overrides them.</p>}
        {source === "none" && <p className="text-muted">Email is off. Invites will still show their link on screen.</p>}
      </div>

      <MailSettingsForm
        saved={
          row?.smtpHost && row.mailFrom
            ? {
                smtpHost: row.smtpHost,
                smtpPort: row.smtpPort,
                smtpSecure: row.smtpSecure,
                smtpUser: row.smtpUser ?? "",
                hasPassword: Boolean(row.smtpPassword),
                mailFrom: row.mailFrom,
              }
            : null
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <form action={sendTestMail}>
          <button className={secondaryButtonClass} disabled={source === "none"}>Send a test email to me</button>
        </form>
        {source === "database" && (
          <form action={clearMailSettings}>
            <button className="text-sm text-danger underline">Remove saved settings</button>
          </form>
        )}
      </div>
    </section>
  );
}
