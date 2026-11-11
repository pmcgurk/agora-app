import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, stripe, isBlocked, activate, recordTip, emails } = vi.hoisted(() => ({
  prisma: {
    subscription: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    tier: { findUnique: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
    payment: { updateMany: vi.fn(), upsert: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  },
  stripe: {
    subscriptions: { retrieve: vi.fn(), cancel: vi.fn() },
    refunds: { create: vi.fn() },
    invoicePayments: { list: vi.fn() },
  },
  isBlocked: vi.fn(),
  activate: vi.fn(),
  recordTip: vi.fn(),
  emails: { sendPaymentFailedNotice: vi.fn(), sendMembershipEndedNotice: vi.fn(), sendReceipt: vi.fn(), sendRefundNotices: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/blocks", () => ({ isBlocked }));
vi.mock("@/lib/stripe", () => ({ getStripe: async () => stripe, periodEnd: () => new Date("2026-07-01T00:00:00Z") }));
vi.mock("@/lib/subscriptions", () => ({ activate }));
vi.mock("@/lib/payment-emails", () => emails);
vi.mock("@/lib/tips", () => ({ MAX_TIP_MESSAGE: 280, MAX_TIPPER_NAME: 60, recordTip }));

import { handleStripeEvent } from "@/lib/stripe-events";

const event = (type: string, object: unknown) => ({ id: "evt_1", type, data: { object } }) as unknown as Stripe.Event;

beforeEach(() => {
  vi.resetAllMocks();
  stripe.invoicePayments.list.mockResolvedValue({ data: [] });
  // The usual case: a write changes one row, nothing was recorded yet, and a tip is new.
  prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
  prisma.payment.updateMany.mockResolvedValue({ count: 1 });
  prisma.payment.findMany.mockResolvedValue([{ id: "pay-1" }]);
  prisma.payment.findUnique.mockResolvedValue(null);
  recordTip.mockResolvedValue(true);
});

describe("refunds", () => {
  it("marks a payment refunded only when the charge is refunded in full", async () => {
    await handleStripeEvent(event("charge.refunded", { payment_intent: "pi_1", amount: 1000, amount_refunded: 1000 }));
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { stripePaymentIntentId: "pi_1", status: "PAID" },
      data: { status: "REFUNDED", refundedAt: expect.any(Date) },
    });
  });

  it("tells the patron about a full refund", async () => {
    await handleStripeEvent(event("charge.refunded", { payment_intent: "pi_1", amount: 1000, amount_refunded: 1000 }));
    expect(emails.sendRefundNotices).toHaveBeenCalledWith(["pay-1"]);
  });

  it("does not tell them twice when Stripe delivers the refund again", async () => {
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    await handleStripeEvent(event("charge.refunded", { payment_intent: "pi_1", amount: 1000, amount_refunded: 1000 }));
    expect(emails.sendRefundNotices).not.toHaveBeenCalled();
  });

  it("ignores a partial refund", async () => {
    await handleStripeEvent(event("charge.refunded", { payment_intent: "pi_1", amount: 1000, amount_refunded: 400 }));
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });
});

describe("tips", () => {
  const session = (overrides: Record<string, unknown> = {}) => ({
    id: "cs_1",
    mode: "payment",
    payment_status: "paid",
    payment_intent: "pi_1",
    amount_total: 1000,
    currency: "gbp",
    metadata: { kind: "tip", creatorId: "creator-1", patronId: "patron-1", message: "Thanks!", tipperName: "Sam" },
    ...overrides,
  });

  beforeEach(() => {
    prisma.user.findFirst.mockResolvedValue({ id: "creator-1", name: "Paul" });
    prisma.user.findUnique.mockResolvedValue({ id: "patron-1", name: "Sam P", email: "sam@example.com" });
    isBlocked.mockResolvedValue(false);
  });

  it("sends a tip receipt to the member who tipped", async () => {
    await handleStripeEvent(event("checkout.session.completed", session()));
    expect(emails.sendReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sam@example.com", name: "Sam P", creatorName: "Paul", description: "Tip", amount: 1000, currency: "gbp" }),
    );
  });

  it("sends a guest's tip receipt to the address they gave at checkout", async () => {
    await handleStripeEvent(
      event("checkout.session.completed", session({ metadata: { kind: "tip", creatorId: "creator-1", tipperName: "Alex" }, customer_details: { email: "guest@example.com" } })),
    );
    expect(emails.sendReceipt).toHaveBeenCalledWith(expect.objectContaining({ to: "guest@example.com", name: "Alex" }));
  });

  it("sends no second receipt when the tip was already recorded", async () => {
    recordTip.mockResolvedValue(false);
    await handleStripeEvent(event("checkout.session.completed", session()));
    expect(emails.sendReceipt).not.toHaveBeenCalled();
  });

  it("records a paid tip with the amount Stripe charged", async () => {
    await handleStripeEvent(event("checkout.session.completed", session()));
    expect(recordTip).toHaveBeenCalledWith(
      expect.objectContaining({ creatorId: "creator-1", patronId: "patron-1", amount: 1000, currency: "gbp", stripeCheckoutSessionId: "cs_1", stripePaymentIntentId: "pi_1" }),
    );
  });

  it("does not record a tip that has not been paid", async () => {
    await handleStripeEvent(event("checkout.session.completed", session({ payment_status: "unpaid" })));
    expect(recordTip).not.toHaveBeenCalled();
  });

  it("refunds, rather than records, a tip from someone who was blocked meanwhile", async () => {
    isBlocked.mockResolvedValue(true);
    await handleStripeEvent(event("checkout.session.completed", session()));
    expect(recordTip).not.toHaveBeenCalled();
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: "pi_1" }, { idempotencyKey: "refund-tip-cs_1" });
  });

  it("ignores checkout sessions that are not tips", async () => {
    await handleStripeEvent(event("checkout.session.completed", session({ metadata: {} })));
    expect(recordTip).not.toHaveBeenCalled();
  });

  it("records a guest tip with no patron", async () => {
    await handleStripeEvent(event("checkout.session.completed", session({ metadata: { kind: "tip", creatorId: "creator-1" } })));
    expect(recordTip).toHaveBeenCalledWith(expect.objectContaining({ patronId: null }));
  });
});

describe("subscriptions", () => {
  const sub = (status: string, extra: Record<string, unknown> = {}) =>
    ({ id: "sub_1", status, cancel_at_period_end: false, metadata: { patronId: "patron-1", tierId: "tier-1" }, ...extra }) as unknown as Stripe.Subscription;

  it("cancels the local plan when Stripe cancels it", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ id: "local-1", status: "ACTIVE" });
    await handleStripeEvent(event("customer.subscription.deleted", sub("canceled")));
    expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { id: "local-1" }, data: { status: "CANCELED", cancelAtPeriodEnd: false } });
  });

  it("keeps access for a grace period, and tells the patron once, when the card fails", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ id: "local-1", status: "ACTIVE", paymentFailedAt: null });
    await handleStripeEvent(event("customer.subscription.updated", sub("past_due")));
    const call = prisma.subscription.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "local-1", status: "ACTIVE", paymentFailedAt: null });
    expect(call.data.paymentFailedAt).toBeInstanceOf(Date);
    expect(call.data.expiresAt.getTime() - call.data.paymentFailedAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    // Access is not cut: the plan itself is not rewritten as past due.
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(emails.sendPaymentFailedNotice).toHaveBeenCalledWith("local-1", 7);
  });

  it("does not tell the patron again for the next failed attempt", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ id: "local-1", status: "ACTIVE", paymentFailedAt: new Date() });
    prisma.subscription.updateMany.mockResolvedValue({ count: 0 });
    await handleStripeEvent(event("customer.subscription.updated", sub("past_due")));
    expect(emails.sendPaymentFailedNotice).not.toHaveBeenCalled();
  });

  it("ends access and says so when Stripe gives up on collecting", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ id: "local-1", status: "ACTIVE", paymentFailedAt: new Date() });
    await handleStripeEvent(event("customer.subscription.updated", sub("unpaid")));
    expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { id: "local-1" }, data: { status: "PAST_DUE" } });
    expect(emails.sendMembershipEndedNotice).toHaveBeenCalledWith("local-1");
  });

  it("says the membership ended when a plan with a failed payment is cancelled", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ id: "local-1", status: "ACTIVE", paymentFailedAt: new Date() });
    await handleStripeEvent(event("customer.subscription.deleted", sub("canceled")));
    expect(emails.sendMembershipEndedNotice).toHaveBeenCalledWith("local-1");
  });

  it("sends no payment email for an ordinary cancellation", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ id: "local-1", status: "ACTIVE", paymentFailedAt: null });
    await handleStripeEvent(event("customer.subscription.deleted", sub("canceled")));
    expect(emails.sendMembershipEndedNotice).not.toHaveBeenCalled();
  });

  it("clears the failure when the payment finally goes through", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ id: "local-1", status: "ACTIVE", paymentFailedAt: new Date() });
    await handleStripeEvent(event("customer.subscription.updated", sub("active")));
    expect(prisma.subscription.update.mock.calls[0][0].data.paymentFailedAt).toBeNull();
  });

  it("counts a failed invoice even if Stripe still reports the plan as active", async () => {
    stripe.subscriptions.retrieve.mockResolvedValue({ id: "sub_1", status: "active", cancel_at_period_end: false, metadata: {} });
    prisma.subscription.findUnique
      .mockResolvedValueOnce({ id: "local-1", status: "ACTIVE", paymentFailedAt: null })
      .mockResolvedValueOnce({ id: "local-1", status: "ACTIVE" });
    await handleStripeEvent(event("invoice.payment_failed", { id: "in_2", parent: { subscription_details: { subscription: "sub_1" } } }));
    expect(emails.sendPaymentFailedNotice).toHaveBeenCalledWith("local-1", 7);
  });

  it("does not start a grace period for a plan that was already ended", async () => {
    stripe.subscriptions.retrieve.mockResolvedValue({ id: "sub_1", status: "past_due", cancel_at_period_end: false, metadata: {} });
    prisma.subscription.findUnique.mockResolvedValue({ id: "local-1", status: "CANCELED", paymentFailedAt: null });
    await handleStripeEvent(event("invoice.payment_failed", { id: "in_2", parent: { subscription_details: { subscription: "sub_1" } } }));
    expect(emails.sendPaymentFailedNotice).not.toHaveBeenCalled();
  });

  it("keeps a plan the creator ended ended, even if Stripe still says active", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ id: "local-1", status: "CANCELED" });
    await handleStripeEvent(event("customer.subscription.updated", sub("active")));
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it("reactivates a live plan and gives a few days' grace past the period end", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ id: "local-1", status: "PAST_DUE" });
    await handleStripeEvent(event("customer.subscription.updated", sub("active")));
    const data = prisma.subscription.update.mock.calls[0][0].data;
    expect(data.status).toBe("ACTIVE");
    expect(data.expiresAt.getTime()).toBe(new Date("2026-07-01T00:00:00Z").getTime() + 3 * 24 * 60 * 60 * 1000);
  });

  it("ends access exactly at the period end when the patron cancelled", async () => {
    prisma.subscription.findUnique.mockResolvedValue({ id: "local-1", status: "ACTIVE" });
    await handleStripeEvent(event("customer.subscription.updated", sub("active", { cancel_at_period_end: true })));
    expect(prisma.subscription.update.mock.calls[0][0].data.expiresAt).toEqual(new Date("2026-07-01T00:00:00Z"));
  });

  it("creates the local plan from checkout metadata for a new live subscription", async () => {
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.tier.findUnique.mockResolvedValue({ id: "tier-1", creatorId: "creator-1" });
    isBlocked.mockResolvedValue(false);
    await handleStripeEvent(event("customer.subscription.updated", sub("active")));
    expect(activate).toHaveBeenCalledWith("patron-1", { id: "tier-1", creatorId: "creator-1" }, expect.objectContaining({ stripeSubscriptionId: "sub_1" }));
  });

  it("cancels in Stripe, instead of billing, when a blocked patron subscribes", async () => {
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.tier.findUnique.mockResolvedValue({ id: "tier-1", creatorId: "creator-1" });
    isBlocked.mockResolvedValue(true);
    stripe.subscriptions.cancel.mockResolvedValue({});
    await handleStripeEvent(event("customer.subscription.updated", sub("active")));
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_1");
    expect(activate).not.toHaveBeenCalled();
  });

  it("does not create a plan from a subscription that is not live", async () => {
    prisma.subscription.findUnique.mockResolvedValue(null);
    await handleStripeEvent(event("customer.subscription.updated", sub("incomplete")));
    expect(activate).not.toHaveBeenCalled();
  });
});

describe("invoices and unknown events", () => {
  it("ignores an invoice with nothing paid", async () => {
    await handleStripeEvent(event("invoice.paid", { id: "in_1", amount_paid: 0, parent: { subscription_details: { subscription: "sub_1" } } }));
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(prisma.payment.upsert).not.toHaveBeenCalled();
  });

  const plan = {
    patronId: "patron-1",
    tier: { id: "tier-1", creatorId: "creator-1", name: "Gold", creator: { name: "Paul" } },
    patron: { name: "Sam", email: "sam@example.com" },
  };

  it("records a paid invoice once, keyed by its id", async () => {
    stripe.subscriptions.retrieve.mockResolvedValue({ id: "sub_1", status: "active", cancel_at_period_end: false, metadata: {} });
    prisma.subscription.findUnique
      .mockResolvedValueOnce({ id: "local-1", status: "ACTIVE" })
      .mockResolvedValueOnce(plan);
    await handleStripeEvent(event("invoice.paid", { id: "in_1", amount_paid: 1200, currency: "gbp", hosted_invoice_url: "https://invoice.stripe.com/i/1", parent: { subscription_details: { subscription: "sub_1" } } }));
    expect(prisma.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stripeInvoiceId: "in_1" }, update: {}, create: expect.objectContaining({ amount: 1200, currency: "GBP", patronId: "patron-1", creatorId: "creator-1" }) }),
    );
  });

  it("sends a receipt with the invoice link for a new payment", async () => {
    stripe.subscriptions.retrieve.mockResolvedValue({ id: "sub_1", status: "active", cancel_at_period_end: false, metadata: {} });
    prisma.subscription.findUnique.mockResolvedValueOnce({ id: "local-1", status: "ACTIVE" }).mockResolvedValueOnce(plan);
    await handleStripeEvent(event("invoice.paid", { id: "in_1", amount_paid: 1200, currency: "gbp", hosted_invoice_url: "https://invoice.stripe.com/i/1", parent: { subscription_details: { subscription: "sub_1" } } }));
    expect(emails.sendReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sam@example.com", name: "Sam", creatorName: "Paul", description: "Gold membership", amount: 1200, currency: "gbp", receiptUrl: "https://invoice.stripe.com/i/1" }),
    );
  });

  it("does not send a second receipt when the same invoice is delivered again", async () => {
    stripe.subscriptions.retrieve.mockResolvedValue({ id: "sub_1", status: "active", cancel_at_period_end: false, metadata: {} });
    prisma.subscription.findUnique.mockResolvedValueOnce({ id: "local-1", status: "ACTIVE" }).mockResolvedValueOnce(plan);
    prisma.payment.findUnique.mockResolvedValue({ id: "pay-1" });
    await handleStripeEvent(event("invoice.paid", { id: "in_1", amount_paid: 1200, currency: "gbp", parent: { subscription_details: { subscription: "sub_1" } } }));
    expect(emails.sendReceipt).not.toHaveBeenCalled();
  });

  it("does nothing for event types it does not know", async () => {
    await handleStripeEvent(event("customer.created", {}));
    expect(Object.values(prisma).flatMap((model) => Object.values(model)).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });
});
