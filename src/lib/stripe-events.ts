import type Stripe from "stripe";
import { isBlocked } from "@/lib/blocks";
import { prisma } from "@/lib/prisma";
import { getStripe, periodEnd } from "@/lib/stripe";
import { activate } from "@/lib/subscriptions";
import { MAX_TIP_MESSAGE, MAX_TIPPER_NAME, recordTip } from "@/lib/tips";

// Renewals are normally confirmed by invoice.paid; the grace window only covers a delayed webhook.
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

const idOf = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === "string" ? value : (value?.id ?? null);

function accessEnd(subscription: Stripe.Subscription): Date | null {
  const end = periodEnd(subscription);
  if (!end) return null;
  return subscription.cancel_at_period_end ? end : new Date(end.getTime() + GRACE_MS);
}

// Mirrors a Stripe subscription onto the local plan, creating it from our checkout metadata when needed.
async function syncSubscription(stripeSub: Stripe.Subscription): Promise<void> {
  const local = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: stripeSub.id } });
  const live = stripeSub.status === "active" || stripeSub.status === "trialing";

  if (!local) {
    const { patronId, tierId } = stripeSub.metadata ?? {};
    if (!live || !patronId || !tierId) return;
    const tier = await prisma.tier.findUnique({ where: { id: tierId }, select: { id: true, creatorId: true } });
    if (!tier || (await isBlocked(tier.creatorId, patronId))) {
      // Never leave a customer billed for access they cannot have.
      await (await getStripe()).subscriptions.cancel(stripeSub.id).catch((error) => console.error("Stripe cancel failed", error));
      return;
    }
    await activate(patronId, tier, { stripeSubscriptionId: stripeSub.id, expiresAt: accessEnd(stripeSub) });
    if (stripeSub.cancel_at_period_end) {
      await prisma.subscription.updateMany({ where: { stripeSubscriptionId: stripeSub.id }, data: { cancelAtPeriodEnd: true } });
    }
    return;
  }

  if (stripeSub.status === "canceled" || stripeSub.status === "incomplete_expired") {
    await prisma.subscription.update({ where: { id: local.id }, data: { status: "CANCELED", cancelAtPeriodEnd: false } });
  } else if (stripeSub.status === "past_due" || stripeSub.status === "unpaid") {
    await prisma.subscription.update({ where: { id: local.id }, data: { status: "PAST_DUE" } });
  } else if (live) {
    // A plan the creator ended or that was replaced stays ended even if Stripe lags behind.
    if (local.status === "CANCELED") return;
    await prisma.subscription.update({
      where: { id: local.id },
      data: { status: "ACTIVE", cancelAtPeriodEnd: stripeSub.cancel_at_period_end, expiresAt: accessEnd(stripeSub) },
    });
  }
}

async function recordInvoice(invoice: Stripe.Invoice): Promise<void> {
  const stripeSubId = idOf(invoice.parent?.subscription_details?.subscription);
  if (!stripeSubId || invoice.amount_paid <= 0) return;
  const stripe = await getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
  await syncSubscription(stripeSub);

  const plan = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: stripeSubId },
    include: { tier: { select: { id: true, creatorId: true, name: true } } },
  });
  if (!plan) return;

  const payments = await stripe.invoicePayments.list({ invoice: invoice.id!, limit: 1 });
  const intent = idOf(payments.data[0]?.payment.payment_intent);
  await prisma.payment.upsert({
    where: { stripeInvoiceId: invoice.id! },
    update: {},
    create: {
      patronId: plan.patronId,
      creatorId: plan.tier.creatorId,
      tierId: plan.tier.id,
      amount: invoice.amount_paid,
      currency: invoice.currency.toUpperCase(),
      stripeInvoiceId: invoice.id!,
      stripePaymentIntentId: intent,
    },
  });
}

async function markRefunded(charge: Stripe.Charge): Promise<void> {
  const intent = idOf(charge.payment_intent);
  if (!intent || charge.amount_refunded < charge.amount) return;
  await prisma.payment.updateMany({
    where: { stripePaymentIntentId: intent, status: "PAID" },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });
}

// Records a paid one-off tip checkout (from a patron or a guest). A tip from someone who got blocked
// meanwhile is refunded instead.
async function recordTipSession(session: Stripe.Checkout.Session): Promise<void> {
  const { creatorId, message, tipperName } = session.metadata ?? {};
  if (session.metadata?.kind !== "tip" || session.payment_status !== "paid" || !creatorId) return;
  const intent = idOf(session.payment_intent);
  const creator = await prisma.user.findFirst({ where: { id: creatorId, role: "CREATOR" }, select: { id: true } });
  if (!creator) return;
  const patron = session.metadata.patronId
    ? await prisma.user.findUnique({ where: { id: session.metadata.patronId }, select: { id: true } })
    : null;
  if (patron && (await isBlocked(creatorId, patron.id))) {
    if (intent) {
      await (await getStripe()).refunds.create({ payment_intent: intent }, { idempotencyKey: `refund-tip-${session.id}` });
    }
    return;
  }
  await recordTip({
    patronId: patron?.id ?? null,
    creatorId,
    amount: session.amount_total ?? 0,
    currency: session.currency ?? "usd",
    message: message?.slice(0, MAX_TIP_MESSAGE) || null,
    tipperName: tipperName?.slice(0, MAX_TIPPER_NAME) || null,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: intent,
  });
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "payment") return recordTipSession(session);
      const stripeSubId = idOf(session.subscription);
      if (session.mode !== "subscription" || !stripeSubId) return;
      await syncSubscription(await (await getStripe()).subscriptions.retrieve(stripeSubId));
      return;
    }
    case "checkout.session.async_payment_succeeded":
      return recordTipSession(event.data.object);
    case "invoice.paid":
      return recordInvoice(event.data.object);
    case "invoice.payment_failed": {
      const stripeSubId = idOf(event.data.object.parent?.subscription_details?.subscription);
      if (stripeSubId) await syncSubscription(await (await getStripe()).subscriptions.retrieve(stripeSubId));
      return;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return syncSubscription(event.data.object);
    case "charge.refunded":
      return markRefunded(event.data.object);
  }
}
