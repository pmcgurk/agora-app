import { activeSubscriptionWhere } from "@/lib/access";
import { notifyNewMember } from "@/lib/notifications";
import { stripeConfigured } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { getStripe, isMissingResource, periodEnd } from "@/lib/stripe";

type EndResult = { endsAt: Date | null };

// Ends one plan. Paid Stripe plans can run until the end of the paid period; everything else
// (free follows, gifts, test checkout) ends immediately. Stripe is told first, so a failed call
// never leaves a plan that is canceled here but still billed there.
export async function endPlan(subscriptionId: string, options: { atPeriodEnd: boolean }): Promise<EndResult> {
  const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) return { endsAt: null };

  if (subscription.stripeSubscriptionId && (await stripeConfigured())) {
    const stripe = await getStripe();
    if (options.atPeriodEnd) {
      const updated = await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true });
      const endsAt = periodEnd(updated);
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: true, expiresAt: endsAt },
      });
      return { endsAt };
    }
    try {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    } catch (error) {
      if (!isMissingResource(error)) throw error;
    }
  }
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "CANCELED", cancelAtPeriodEnd: false },
  });
  return { endsAt: null };
}

// One plan per creator: every other active plan is ended right away.
export async function endOtherPlans(patronId: string, creatorId: string, keepTierId: string | null): Promise<void> {
  const others = await prisma.subscription.findMany({
    where: { patronId, status: "ACTIVE", tier: { creatorId }, ...(keepTierId ? { tierId: { not: keepTierId } } : {}) },
    select: { id: true },
  });
  for (const other of others) await endPlan(other.id, { atPeriodEnd: false });
}

export async function endAllPlans(patronId: string, creatorId: string): Promise<void> {
  await endOtherPlans(patronId, creatorId, null);
}

// A patron holds one plan per creator: activating a tier replaces any other active plan.
export async function activate(
  patronId: string,
  tier: { id: string; creatorId: string },
  options: { stripeSubscriptionId?: string; expiresAt?: Date | null } = {},
): Promise<void> {
  const existing = await prisma.subscription.findUnique({ where: { patronId_tierId: { patronId, tierId: tier.id } } });
  const wasActive =
    existing?.status === "ACTIVE" && !existing.gifted && (!existing.expiresAt || existing.expiresAt > new Date());
  await endOtherPlans(patronId, tier.creatorId, tier.id);
  const data = {
    status: "ACTIVE" as const,
    gifted: false,
    expiresAt: options.expiresAt ?? null,
    cancelAtPeriodEnd: false,
    ...(options.stripeSubscriptionId ? { stripeSubscriptionId: options.stripeSubscriptionId } : {}),
  };
  await prisma.subscription.upsert({
    where: { patronId_tierId: { patronId, tierId: tier.id } },
    update: data,
    create: { patronId, tierId: tier.id, ...data },
  });
  if (!wasActive) await notifyNewMember(patronId, tier.id);
}

export async function hasActivePaidPlan(patronId: string, creatorId: string): Promise<boolean> {
  const found = await prisma.subscription.findFirst({
    where: { patronId, ...activeSubscriptionWhere(), tier: { creatorId, price: { gt: 0 } } },
    select: { id: true },
  });
  return found !== null;
}
