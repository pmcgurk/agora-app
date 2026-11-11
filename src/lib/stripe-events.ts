import type Stripe from "stripe";
import { isBlocked } from "@/lib/blocks";
import { sendMembershipEndedNotice, sendPaymentFailedNotice, sendReceipt, sendRefundNotices } from "@/lib/payment-emails";
import { prisma } from "@/lib/prisma";
import { getStripe, periodEnd } from "@/lib/stripe";
import { activate } from "@/lib/subscriptions";
import { MAX_TIP_MESSAGE, MAX_TIPPER_NAME, recordTip } from "@/lib/tips";

// Renewals are normally confirmed by invoice.paid; the grace window only covers a delayed webhook.
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

// When a renewal payment fails, access carries on this long while Stripe retries the card and the patron fixes it.
// If it still has not gone through by then, access ends even if Stripe has not given up yet.
export const PAYMENT_GRACE_DAYS = 7;
const PAYMENT_GRACE_MS = PAYMENT_GRACE_DAYS * 24 * 60 * 60 * 1000;

const idOf = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === "string" ? value : (value?.id ?? null);

function accessEnd(subscription: Stripe.Subscription): Date | null {
  const end = periodEnd(subscription);
  if (!end) return null;
  return subscription.cancel_at_period_end ? end : new Date(end.getTime() + GRACE_MS);
}

// Notes that a renewal payment failed: starts the grace period and tells the patron, once. Calling it again for the
// same failure (Stripe retries the card several times) changes nothing and sends nothing.
async function markPaymentFailed(plan: { id: string; status: string }): Promise<void> {
  if (plan.status !== "ACTIVE") return;
  const now = new Date();
  const first = await prisma.subscription.updateMany({
    where: { id: plan.id, status: "ACTIVE", paymentFailedAt: null },
    data: { paymentFailedAt: now, expiresAt: new Date(now.getTime() + PAYMENT_GRACE_MS) },
  });
  if (first.count === 1) await sendPaymentFailedNotice(plan.id, PAYMENT_GRACE_DAYS);
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
    // Ended because the card never worked, not because the patron or creator ended it.
    if (local.paymentFailedAt && local.status !== "CANCELED") await sendMembershipEndedNotice(local.id);
  } else if (stripeSub.status === "past_due") {
    // The card failed but Stripe is still retrying: keep access for the grace period instead of cutting it off.
    if (local.status !== "CANCELED") await markPaymentFailed(local);
  } else if (stripeSub.status === "unpaid") {
    // Stripe has given up on collecting: access ends now.
    if (local.status === "CANCELED") return;
    await prisma.subscription.update({ where: { id: local.id }, data: { status: "PAST_DUE" } });
    if (local.status !== "PAST_DUE") await sendMembershipEndedNotice(local.id);
  } else if (live) {
    // A plan the creator ended or that was replaced stays ended even if Stripe lags behind.
    if (local.status === "CANCELED") return;
    await prisma.subscription.update({
      where: { id: local.id },
      // Paid up again: the failed payment (if any) no longer counts.
      data: { status: "ACTIVE", cancelAtPeriodEnd: stripeSub.cancel_at_period_end, expiresAt: accessEnd(stripeSub), paymentFailedAt: null },
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
    include: {
      tier: { select: { id: true, creatorId: true, name: true, creator: { select: { name: true } } } },
      patron: { select: { name: true, email: true } },
    },
  });
  if (!plan) return;
  const alreadyRecorded = (await prisma.payment.findUnique({ where: { stripeInvoiceId: invoice.id! }, select: { id: true } })) !== null;

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
  // Stripe can deliver the same event more than once; only the first one sends a receipt.
  if (!alreadyRecorded) {
    await sendReceipt({
      to: plan.patron.email,
      name: plan.patron.name,
      creatorName: plan.tier.creator.name,
      description: `${plan.tier.name} membership`,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      date: new Date(),
      receiptUrl: invoice.hosted_invoice_url ?? null,
    });
  }
}

async function markRefunded(charge: Stripe.Charge): Promise<void> {
  const intent = idOf(charge.payment_intent);
  if (!intent || charge.amount_refunded < charge.amount) return;
  const refunding = await prisma.payment.findMany({ where: { stripePaymentIntentId: intent, status: "PAID" }, select: { id: true } });
  const result = await prisma.payment.updateMany({
    where: { stripePaymentIntentId: intent, status: "PAID" },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });
  // Only the delivery that actually changed something tells the patron.
  if (result.count > 0) await sendRefundNotices(refunding.map((payment) => payment.id));
}

// Records a paid one-off tip checkout (from a patron or a guest). A tip from someone who got blocked
// meanwhile is refunded instead.
async function recordTipSession(session: Stripe.Checkout.Session): Promise<void> {
  const { creatorId, message, tipperName } = session.metadata ?? {};
  if (session.metadata?.kind !== "tip" || session.payment_status !== "paid" || !creatorId) return;
  const intent = idOf(session.payment_intent);
  const creator = await prisma.user.findFirst({ where: { id: creatorId, role: "CREATOR" }, select: { id: true, name: true } });
  if (!creator) return;
  const patron = session.metadata.patronId
    ? await prisma.user.findUnique({ where: { id: session.metadata.patronId }, select: { id: true, name: true, email: true } })
    : null;
  if (patron && (await isBlocked(creatorId, patron.id))) {
    if (intent) {
      await (await getStripe()).refunds.create({ payment_intent: intent }, { idempotencyKey: `refund-tip-${session.id}` });
    }
    return;
  }
  const recorded = await recordTip({
    patronId: patron?.id ?? null,
    creatorId,
    amount: session.amount_total ?? 0,
    currency: session.currency ?? "usd",
    message: message?.slice(0, MAX_TIP_MESSAGE) || null,
    tipperName: tipperName?.slice(0, MAX_TIPPER_NAME) || null,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: intent,
  });
  // A tip from a guest has no account, so the receipt goes to the address they gave Stripe.
  if (recorded) {
    await sendReceipt({
      to: patron?.email ?? session.customer_details?.email ?? null,
      name: patron?.name ?? tipperName ?? null,
      creatorName: creator.name,
      description: "Tip",
      amount: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
      date: new Date(),
    });
  }
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
      if (!stripeSubId) return;
      await syncSubscription(await (await getStripe()).subscriptions.retrieve(stripeSubId));
      // Stripe may still report the plan as active at this moment; the failure counts either way.
      const plan = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: stripeSubId }, select: { id: true, status: true } });
      if (plan) await markPaymentFailed(plan);
      return;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return syncSubscription(event.data.object);
    case "charge.refunded":
      return markRefunded(event.data.object);
  }
}
