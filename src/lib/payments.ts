import { cache } from "react";
import { isDemoMode } from "@/lib/demo";
import { prisma } from "@/lib/prisma";

export type PaymentMode = "stripe" | "test" | "off";

export const STRIPE_KEY_PATTERN = /^(sk|rk)_(test|live)_[A-Za-z0-9]{8,}$/;
export const STRIPE_WEBHOOK_SECRET_PATTERN = /^whsec_[A-Za-z0-9+/=_-]{8,}$/;

export type StripeConfig = {
  secretKey: string | null;
  webhookSecret: string | null;
  // Where the secret key comes from: saved in Settings, the environment, or nowhere.
  source: "settings" | "env" | null;
};

// Keys saved from the settings panel win over the STRIPE_* environment variables.
export const getStripeConfig = cache(async (): Promise<StripeConfig> => {
  // The public demo never talks to Stripe, whatever keys happen to be configured.
  if (isDemoMode()) return { secretKey: null, webhookSecret: null, source: null };
  const row = await prisma.instanceSetting.findUnique({
    where: { id: "instance" },
    select: { stripeSecretKey: true, stripeWebhookSecret: true },
  });
  if (row?.stripeSecretKey && STRIPE_KEY_PATTERN.test(row.stripeSecretKey)) {
    return {
      secretKey: row.stripeSecretKey,
      webhookSecret: row.stripeWebhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? null,
      source: "settings",
    };
  }
  const envKey = process.env.STRIPE_SECRET_KEY ?? "";
  if (STRIPE_KEY_PATTERN.test(envKey)) {
    return { secretKey: envKey, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? null, source: "env" };
  }
  return { secretKey: null, webhookSecret: null, source: null };
});

export async function stripeConfigured(): Promise<boolean> {
  return (await getStripeConfig()).secretKey !== null;
}

// Stripe wins when a real key is set. Otherwise paid tiers use the no-money test checkout only
// while ALLOW_FREE_SUBSCRIPTIONS=true; with neither, only the free tier can be joined.
export async function paymentMode(): Promise<PaymentMode> {
  // Demo visitors can "buy" tiers and send tips without any money moving.
  if (isDemoMode()) return "test";
  if (await stripeConfigured()) return "stripe";
  return process.env.ALLOW_FREE_SUBSCRIPTIONS === "true" ? "test" : "off";
}

export const testCheckoutEnabled = async () => (await paymentMode()) === "test";
