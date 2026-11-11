import { creatorPath } from "@/lib/creator";
import { formatMoney } from "@/lib/currency";
import { membershipEndedEmail, paymentFailedEmail, receiptEmail, refundEmail } from "@/lib/email-templates";
import { siteName } from "@/lib/instance";
import { getMailSettings, sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/urls";

// Emails about money: a failing card, a membership that ended because of it, receipts and refunds. They are sent
// from Stripe webhooks, so none of them may throw: a failed email must never make Stripe deliver the event again
// (that would repeat the others). Each is skipped quietly on a site with no email set up.

async function safely(what: string, send: () => Promise<void>): Promise<void> {
  try {
    if (!(await getMailSettings())) return;
    await send();
  } catch (error) {
    console.error(`Could not send the ${what} email:`, error instanceof Error ? error.message : error);
  }
}

const day = (date: Date) => date.toISOString().slice(0, 10);

const planFor = (subscriptionId: string) =>
  prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      patron: { select: { name: true, email: true } },
      tier: { select: { name: true, creator: { select: { id: true, name: true, slug: true } } } },
    },
  });

// Tells a patron their renewal failed and how long access carries on.
export function sendPaymentFailedNotice(subscriptionId: string, graceDays: number): Promise<void> {
  return safely("failed payment", async () => {
    const plan = await planFor(subscriptionId);
    if (!plan) return;
    await sendMail(
      paymentFailedEmail({
        to: plan.patron.email,
        siteName: await siteName(),
        name: plan.patron.name,
        creatorName: plan.tier.creator.name,
        tierName: plan.tier.name,
        graceDays,
        url: publicUrl("/settings/subscriptions"),
      }),
    );
  });
}

// Tells a patron their membership ended because the payment never went through.
export function sendMembershipEndedNotice(subscriptionId: string): Promise<void> {
  return safely("membership ended", async () => {
    const plan = await planFor(subscriptionId);
    if (!plan) return;
    await sendMail(
      membershipEndedEmail({
        to: plan.patron.email,
        siteName: await siteName(),
        name: plan.patron.name,
        creatorName: plan.tier.creator.name,
        tierName: plan.tier.name,
        url: publicUrl(creatorPath(plan.tier.creator)),
      }),
    );
  });
}

type ReceiptInput = {
  // Who to send it to. A guest tip has no account, only the address they gave at checkout.
  to: string | null;
  name: string | null;
  creatorName: string;
  description: string;
  amount: number;
  currency: string;
  date: Date;
  receiptUrl?: string | null;
};

export function sendReceipt(input: ReceiptInput): Promise<void> {
  return safely("receipt", async () => {
    if (!input.to) return;
    await sendMail(
      receiptEmail({
        to: input.to,
        siteName: await siteName(),
        name: input.name ?? "there",
        creatorName: input.creatorName,
        description: input.description,
        amount: formatMoney(input.amount, input.currency),
        date: day(input.date),
        receiptUrl: input.receiptUrl ?? null,
      }),
    );
  });
}

// Tells the patron each payment that was just refunded in full. Guest tips have nobody to tell.
export function sendRefundNotices(paymentIds: string[]): Promise<void> {
  return safely("refund", async () => {
    const payments = await prisma.payment.findMany({
      where: { id: { in: paymentIds }, patronId: { not: null } },
      select: {
        kind: true,
        amount: true,
        currency: true,
        patron: { select: { name: true, email: true } },
        tier: { select: { name: true } },
        creator: { select: { name: true } },
      },
    });
    const site = await siteName();
    for (const payment of payments) {
      if (!payment.patron) continue;
      await sendMail(
        refundEmail({
          to: payment.patron.email,
          siteName: site,
          name: payment.patron.name,
          creatorName: payment.creator.name,
          description: payment.kind === "TIP" ? "Tip" : `${payment.tier?.name ?? "Membership"} membership`,
          amount: formatMoney(payment.amount, payment.currency),
        }),
      );
    }
  });
}
