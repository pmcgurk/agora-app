"use server";

import { redirect } from "next/navigation";
import { createApiKey } from "@/lib/api-keys";
import { requireUser } from "@/lib/auth";
import { DEMO_OFF, isDemoMode } from "@/lib/demo";
import { prisma } from "@/lib/prisma";
import { deliver, isWebhookEvent, newWebhookSecret, parseWebhookUrl, WEBHOOK_EVENTS } from "@/lib/webhooks";

const MAX_KEYS = 10;
const MAX_WEBHOOKS = 10;

export type ApiKeyState = { key?: string; error?: string };

export async function generateApiKey(_previous: ApiKeyState, formData: FormData): Promise<ApiKeyState> {
  const user = await requireUser("CREATOR");
  if (isDemoMode()) return { error: DEMO_OFF };
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 60) return { error: "Name the key (up to 60 characters)." };
  if ((await prisma.apiKey.count({ where: { userId: user.id } })) >= MAX_KEYS) {
    return { error: `You can have up to ${MAX_KEYS} keys. Revoke one first.` };
  }
  return { key: await createApiKey(user.id, name) };
}

export async function revokeApiKey(formData: FormData) {
  const user = await requireUser("CREATOR");
  await prisma.apiKey.deleteMany({ where: { id: String(formData.get("keyId") ?? ""), userId: user.id } });
  redirect("/settings/api-keys?notice=Key+revoked.");
}

function back(kind: "notice" | "error", message: string): never {
  redirect(`/settings/webhooks?${kind}=${encodeURIComponent(message)}`);
}

export async function createWebhook(formData: FormData) {
  const user = await requireUser("CREATOR");
  // Webhooks make the server call outside addresses, so the demo keeps them locked.
  if (isDemoMode()) back("error", DEMO_OFF);
  const url = parseWebhookUrl(String(formData.get("url") ?? "").trim());
  if (!url) back("error", "Enter a valid http(s) URL.");
  const events = formData.getAll("events").map(String).filter(isWebhookEvent);
  if (events.length === 0) back("error", "Choose at least one event.");
  if ((await prisma.webhook.count({ where: { userId: user.id } })) >= MAX_WEBHOOKS) {
    back("error", `You can have up to ${MAX_WEBHOOKS} webhooks.`);
  }
  await prisma.webhook.create({ data: { userId: user.id, url, events, secret: newWebhookSecret() } });
  back("notice", "Webhook added.");
}

export async function toggleWebhook(formData: FormData) {
  const user = await requireUser("CREATOR");
  const hook = await prisma.webhook.findFirst({ where: { id: String(formData.get("webhookId") ?? ""), userId: user.id } });
  if (hook) await prisma.webhook.update({ where: { id: hook.id }, data: { enabled: !hook.enabled } });
  back("notice", hook?.enabled ? "Webhook paused." : "Webhook enabled.");
}

export async function deleteWebhook(formData: FormData) {
  const user = await requireUser("CREATOR");
  await prisma.webhook.deleteMany({ where: { id: String(formData.get("webhookId") ?? ""), userId: user.id } });
  back("notice", "Webhook deleted.");
}

export async function testWebhook(formData: FormData) {
  const user = await requireUser("CREATOR");
  if (isDemoMode()) back("error", DEMO_OFF);
  const hook = await prisma.webhook.findFirst({ where: { id: String(formData.get("webhookId") ?? ""), userId: user.id } });
  if (!hook) back("error", "Webhook not found.");
  const result = await deliver(hook, "ping", { message: "Test event from Agora", events: WEBHOOK_EVENTS.map((event) => event.key) });
  if (result.error) back("error", `Test failed: ${result.error}`);
  back("notice", `Test delivered (HTTP ${result.status}).`);
}
