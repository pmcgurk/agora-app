import Stripe from "stripe";
import { creatorPath, supportPath } from "@/lib/creator";
import { getStripeConfig } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/webhooks";

let client: { key: string; stripe: Stripe } | undefined;

// The client is rebuilt whenever the configured key changes (it can be edited in Settings).
export async function getStripe(): Promise<Stripe> {
  const { secretKey } = await getStripeConfig();
  if (!secretKey) throw new Error("Stripe is not configured.");
  if (!client || client.key !== secretKey) {
    // STRIPE_API_URL lets a proxy or a local mock stand in for api.stripe.com (used in tests).
    const override = process.env.STRIPE_API_URL ? new URL(process.env.STRIPE_API_URL) : null;
    client = {
      key: secretKey,
      stripe: new Stripe(secretKey, {
        appInfo: { name: "Agora" },
        maxNetworkRetries: 2,
        ...(override
          ? { host: override.hostname, port: override.port, protocol: override.protocol.replace(":", "") as "http" | "https" }
          : {}),
      }),
    };
  }
  return client.stripe;
}

type TierRef = { id: string; name: string; price: number; stripePriceId: string | null };
type CreatorRef = { id: string; name: string; slug: string | null; currency: string };

// Stripe prices are immutable, so a new one is created whenever the tier's amount or the
// creator's currency no longer matches the stored one.
export async function ensureStripePrice(tier: TierRef, creator: CreatorRef): Promise<string> {
  const stripe = await getStripe();
  const currency = creator.currency.toLowerCase();
  if (tier.stripePriceId) {
    try {
      const price = await stripe.prices.retrieve(tier.stripePriceId);
      if (price.active && price.unit_amount === tier.price && price.currency === currency && price.recurring?.interval === "month") {
        return price.id;
      }
    } catch {
      // Deleted or unreachable price: fall through and create a fresh one.
    }
  }
  const price = await stripe.prices.create({
    currency,
    unit_amount: tier.price,
    recurring: { interval: "month" },
    product_data: { name: `${creator.name} - ${tier.name}`, metadata: { tierId: tier.id } },
    metadata: { tierId: tier.id },
  });
  await prisma.tier.update({ where: { id: tier.id }, data: { stripePriceId: price.id } });
  return price.id;
}

export async function ensureCustomer(user: { id: string; email: string; name: string; stripeCustomerId: string | null }): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await (await getStripe()).customers.create(
    { email: user.email, name: user.name, metadata: { userId: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

export async function createCheckoutUrl(
  patron: { id: string; email: string; name: string; stripeCustomerId: string | null },
  tier: TierRef,
  creator: CreatorRef,
): Promise<string> {
  const [price, customer] = await Promise.all([ensureStripePrice(tier, creator), ensureCustomer(patron)]);
  const base = creatorPath(creator);
  const metadata = { patronId: patron.id, tierId: tier.id };
  const session = await (await getStripe()).checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: patron.id,
    metadata,
    subscription_data: { metadata },
    success_url: absoluteUrl(`${base}?notice=${encodeURIComponent(`Welcome to ${tier.name}!`)}`),
    cancel_url: absoluteUrl(await supportPath(creator)),
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

type TipOptions = {
  // Logged-in tippers get a Stripe customer; guests pay as a Stripe guest and enter their email there.
  patron: { id: string; email: string; name: string; stripeCustomerId: string | null } | null;
  amount: number;
  message: string | null;
  tipperName: string | null;
};

export async function createTipCheckoutUrl(creator: CreatorRef, returnPath: string, options: TipOptions): Promise<string> {
  const { patron, amount, message, tipperName } = options;
  const customer = patron ? await ensureCustomer(patron) : undefined;
  const base = creatorPath(creator);
  const metadata: Record<string, string> = { kind: "tip", creatorId: creator.id };
  if (patron) metadata.patronId = patron.id;
  if (tipperName) metadata.tipperName = tipperName;
  if (message) metadata.message = message;
  const session = await (await getStripe()).checkout.sessions.create({
    mode: "payment",
    ...(customer ? { customer } : {}),
    line_items: [
      {
        price_data: {
          currency: creator.currency.toLowerCase(),
          unit_amount: amount,
          product_data: { name: `Tip for ${creator.name}` },
        },
        quantity: 1,
      },
    ],
    ...(patron ? { client_reference_id: patron.id } : {}),
    metadata,
    payment_intent_data: { metadata },
    success_url: absoluteUrl(`${base}?notice=${encodeURIComponent("Thanks for your tip!")}`),
    cancel_url: absoluteUrl(returnPath),
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalUrl(user: { id: string; email: string; name: string; stripeCustomerId: string | null }): Promise<string> {
  const customer = await ensureCustomer(user);
  const session = await (await getStripe()).billingPortal.sessions.create({
    customer,
    return_url: absoluteUrl("/settings/subscriptions"),
  });
  return session.url;
}

export function isMissingResource(error: unknown): boolean {
  return (error as { code?: string })?.code === "resource_missing";
}

export const periodEnd = (subscription: Stripe.Subscription): Date | null => {
  const seconds = subscription.items.data[0]?.current_period_end;
  return seconds ? new Date(seconds * 1000) : null;
};
