import Link from "next/link";
import { createWebhook, deleteWebhook, testWebhook, toggleWebhook } from "@/app/actions/developer";
import ConfirmAction from "@/components/ConfirmAction";
import Flash from "@/components/Flash";
import { buttonClass, inputClass, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

export default async function WebhooksSettings({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser("CREATOR");
  const { notice, error } = await searchParams;
  const hooks = await prisma.webhook.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Webhooks</h2>
      <Flash notice={notice} error={error} />
      <p>
        Agora sends a signed POST request to your URL when something happens. See the{" "}
        <Link href="/settings/api-docs#webhooks" className={linkClass}>docs</Link>.
      </p>
      <form action={createWebhook} className="space-y-3">
        <label className="block">
          Endpoint URL
          <input name="url" type="url" required placeholder="https://example.com/agora" className={inputClass} />
        </label>
        <fieldset className="grid gap-1 sm:grid-cols-2">
          <legend className="mb-1">Events</legend>
          {WEBHOOK_EVENTS.map((event) => (
            <label key={event.key} className="flex items-center gap-2">
              <input type="checkbox" name="events" value={event.key} defaultChecked />
              <span>{event.label} <code className="text-muted">{event.key}</code></span>
            </label>
          ))}
        </fieldset>
        <button className={buttonClass}>Add webhook</button>
      </form>

      <ul className="space-y-3">
        {hooks.map((hook) => (
          <li key={hook.id} className="agora-webhook agora-card space-y-2 rounded-theme border border-line bg-surface p-3">
            <p className="break-all font-medium">{hook.url}</p>
            <p className="text-sm text-muted">
              {hook.enabled ? "Active" : "Paused"} · {hook.events.join(", ")}
            </p>
            <p className="text-sm text-muted">
              {hook.lastAttemptAt
                ? `Last delivery ${hook.lastAttemptAt.toISOString().slice(0, 16).replace("T", " ")} UTC: ${hook.lastError ?? `HTTP ${hook.lastStatus}`}`
                : "No deliveries yet"}
            </p>
            <details>
              <summary className="cursor-pointer text-sm">Signing secret</summary>
              <code className="mt-1 block break-all rounded-theme bg-secondary p-2">{hook.secret}</code>
            </details>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <form action={testWebhook}>
                <input type="hidden" name="webhookId" value={hook.id} />
                <button className="underline">Send test</button>
              </form>
              <form action={toggleWebhook}>
                <input type="hidden" name="webhookId" value={hook.id} />
                <button className="underline">{hook.enabled ? "Pause" : "Enable"}</button>
              </form>
              <ConfirmAction
                action={deleteWebhook}
                fields={{ webhookId: hook.id }}
                label="Delete"
                message="Delete this webhook?"
              />
            </div>
          </li>
        ))}
        {hooks.length === 0 && <li className="text-muted">No webhooks yet.</li>}
      </ul>
    </section>
  );
}
