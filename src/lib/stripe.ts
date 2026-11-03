import Stripe from "stripe";
import { creatorPath } from "@/lib/creator";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/webhooks";

let client: Stripe | undefined;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
    // STRIPE_API_URL lets a proxy or a local mock stand in for api.stripe.com (used in tests).
    const override = process.env.STRIPE_API_URL ? new URL(process.env.STRIPE_API_URL) : null;
    client = new Stripe(key, {
      appInfo: { name: "Agora" },
      maxNetworkRetries: 2,
      ...(override
        ? { host: override.hostname, port: override.port, protocol: override.protocol.replace(":", "") as "http" | "https" }
        : {}),
    });
  }
  return client;
}

type TierRef = { id: string; name: string; price: number; stripePriceId: string | null };
type CreatorRef = { id: string; name: string; slug: string | null; currency: string };

// Stripe prices are immutable, so a new one is created whenever the tier's amount or the
// creator's currency no longer matches the stored one.
export async function ensureStripePrice(tier: TierRef, creator: CreatorRef): Promise<string> {
  const stripe = getStripe();
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
  const customer = await getStripe().customers.create(
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
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: patron.id,
    metadata,
    subscription_data: { metadata },
    success_url: absoluteUrl(`${base}?notice=${encodeURIComponent(`Welcome to ${tier.name}!`)}`),
    cancel_url: absoluteUrl(`${base}/support`),
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalUrl(user: { id: string; email: string; name: string; stripeCustomerId: string | null }): Promise<string> {
  const customer = await ensureCustomer(user);
  const session = await getStripe().billingPortal.sessions.create({
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
