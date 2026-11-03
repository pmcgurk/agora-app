import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const WEBHOOK_EVENTS = [
  { key: "post.created", label: "New post published" },
  { key: "comment.created", label: "New comment or reply" },
  { key: "like.created", label: "Post liked" },
  { key: "member.joined", label: "New follower or subscriber" },
  { key: "tip.received", label: "Tip received" },
  { key: "member.refunded", label: "Payment refunded" },
  { key: "member.blocked", label: "User blocked" },
  { key: "message.received", label: "New direct message" },
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["key"];

export const isWebhookEvent = (value: string): value is WebhookEvent =>
  WEBHOOK_EVENTS.some((event) => event.key === value);

export function absoluteUrl(path: string): string {
  return `${(process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "")}${path}`;
}

export const newWebhookSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

// Only http(s) targets are allowed. Private addresses are fine: self-hosters often post to local services.
export function parseWebhookUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function signPayload(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

type Target = { id: string; url: string; secret: string };

const ATTEMPT_DELAYS_MS = [0, 2000, 10000];

async function attempt(target: Target, event: string, body: string, deliveryId: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  try {
    const response = await fetch(target.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Agora-Webhooks/1",
        "X-Agora-Event": event,
        "X-Agora-Delivery": deliveryId,
        "X-Agora-Timestamp": timestamp,
        "X-Agora-Signature": signPayload(target.secret, timestamp, body),
      },
      body,
    });
    return { status: response.status, error: response.ok ? null : `HTTP ${response.status}` };
  } catch (error) {
    return { status: null, error: error instanceof Error ? error.message.slice(0, 200) : "Request failed" };
  }
}

// Delivers with up to three attempts (retrying network errors and 5xx) and records the outcome.
export async function deliver(target: Target, event: string, data: unknown): Promise<{ status: number | null; error: string | null }> {
  const deliveryId = randomUUID();
  const body = JSON.stringify({ id: deliveryId, type: event, createdAt: new Date().toISOString(), data });
  let result: { status: number | null; error: string | null } = { status: null, error: "Not attempted" };
  for (const delay of ATTEMPT_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    result = await attempt(target, event, body, deliveryId);
    if (result.status !== null && result.status < 500) break;
  }
  await prisma.webhook
    .update({
      where: { id: target.id },
      data: { lastAttemptAt: new Date(), lastStatus: result.status, lastError: result.error },
    })
    .catch(() => undefined);
  return result;
}

// Fire and forget: webhooks never slow down or break the action that triggered them.
export function emitEvent(creatorId: string, event: WebhookEvent, data: unknown): void {
  void (async () => {
    try {
      const hooks = await prisma.webhook.findMany({
        where: { userId: creatorId, enabled: true, events: { has: event } },
        select: { id: true, url: true, secret: true },
      });
      await Promise.all(hooks.map((hook) => deliver(hook, event, data)));
    } catch (error) {
      console.error("Webhook dispatch failed", error);
    }
  })();
}
