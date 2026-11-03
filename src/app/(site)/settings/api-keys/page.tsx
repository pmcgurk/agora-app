import Link from "next/link";
import { revokeApiKey } from "@/app/actions/developer";
import ApiKeyForm from "@/components/ApiKeyForm";
import ConfirmAction from "@/components/ConfirmAction";
import Flash from "@/components/Flash";
import { linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ApiKeysSettings({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser("CREATOR");
  const { notice, error } = await searchParams;
  const keys = await prisma.apiKey.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">API keys</h2>
      <Flash notice={notice} error={error} />
      <p>
        Keys give full access to the <Link href="/settings/api-docs" className={linkClass}>API</Link> as you.
      </p>
      <ApiKeyForm />
      <ul className="space-y-2">
        {keys.map((key) => (
          <li key={key.id} className="agora-apikey flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{key.name}</span>
            <code className="text-muted">{key.prefix}…</code>
            <span className="text-muted">
              {key.lastUsedAt ? `used ${key.lastUsedAt.toISOString().slice(0, 10)}` : "never used"}
            </span>
            <span className="ml-auto">
              <ConfirmAction
                action={revokeApiKey}
                fields={{ keyId: key.id }}
                label="Revoke"
                message="Revoke this key? Apps using it stop working."
                confirmLabel="Yes, revoke"
              />
            </span>
          </li>
        ))}
        {keys.length === 0 && <li className="text-muted">No keys yet.</li>}
      </ul>
    </section>
  );
}
