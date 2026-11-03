import Avatar from "@/components/Avatar";
import { blockUser, giftSubscription, refundPayment, revokeSubscription, unblockUser } from "@/app/actions/creator";
import ConfirmAction from "@/components/ConfirmAction";
import Flash from "@/components/Flash";
import { buttonClass, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getCreatorStats } from "@/lib/stats";
import { tipperLabel } from "@/lib/tips";

export const dynamic = "force-dynamic";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const user = await requireUser("CREATOR");
  const { error, notice } = await searchParams;
  const [stats, payments, blocks] = await Promise.all([
    getCreatorStats(user.id),
    prisma.payment.findMany({
      where: { creatorId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { patron: { select: { name: true } }, tier: { select: { name: true } } },
    }),
    prisma.block.findMany({
      where: { creatorId: user.id },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  return (
    <>
      <h1 className="text-3xl font-bold text-primary">Members</h1>
      <Flash notice={notice} error={error} />
      <ul className="space-y-2">
        {stats.subscriptions.map((subscription) => (
          <li key={subscription.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Avatar user={subscription.patron} size={24} />
            <span className="font-medium">{subscription.patron.name}</span>
            <span className="text-muted">{subscription.patron.email}</span>
            <span>{subscription.tier.name}</span>
            {subscription.gifted && (
              <span className="rounded-full bg-secondary px-2 text-xs">
                gift{subscription.expiresAt ? ` until ${subscription.expiresAt.toISOString().slice(0, 10)}` : ""}
              </span>
            )}
            <span className="ml-auto flex items-center gap-3">
              <form action={revokeSubscription}>
                <input type="hidden" name="subscriptionId" value={subscription.id} />
                <button className="text-sm underline">Remove</button>
              </form>
              <ConfirmAction
                action={blockUser}
                fields={{ userId: subscription.patronId }}
                label="Block"
                message={`Block ${subscription.patron.name}?`}
                confirmLabel="Yes, block"
              />
            </span>
          </li>
        ))}
        {stats.subscriptions.length === 0 && <li className="text-muted">No members yet.</li>}
      </ul>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Payments</h2>
        <ul className="space-y-2">
          {payments.map((payment) => (
            <li key={payment.id} className="agora-payment flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{payment.kind === "TIP" ? tipperLabel(payment) : (payment.patron?.name ?? "Unknown")}</span>
              <span>{payment.kind === "TIP" ? "Tip" : (payment.tier?.name ?? "Deleted tier")}</span>
              <span>{formatMoney(payment.amount, payment.currency)}</span>
              <span className="text-muted">{payment.createdAt.toISOString().slice(0, 10)}</span>
              {payment.message && <span className="w-full text-muted">&ldquo;{payment.message}&rdquo;</span>}
              {payment.status === "REFUNDED" ? (
                <span className="ml-auto rounded-full bg-secondary px-2 text-xs">refunded</span>
              ) : (
                <span className="ml-auto">
                  <ConfirmAction
                    action={refundPayment}
                    fields={{ paymentId: payment.id }}
                    label="Refund"
                    message={`Refund ${formatMoney(payment.amount, payment.currency)}${payment.kind === "TIP" ? "" : " and end their plan"}?`}
                    confirmLabel="Yes, refund"
                  />
                </span>
              )}
            </li>
          ))}
          {payments.length === 0 && <li className="text-muted">No payments yet.</li>}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Blocked</h2>
        <ul className="space-y-2">
          {blocks.map((block) => (
            <li key={block.userId} className="agora-blocked flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{block.user.name}</span>
              <span className="text-muted">{block.user.email}</span>
              <form action={unblockUser} className="ml-auto">
                <input type="hidden" name="userId" value={block.userId} />
                <button className="text-sm underline">Unblock</button>
              </form>
            </li>
          ))}
          {blocks.length === 0 && <li className="text-muted">Nobody is blocked.</li>}
        </ul>
        <form action={blockUser} className="flex flex-wrap items-end gap-3">
          <label>
            Block by email
            <input name="email" type="email" required className={inputClass} />
          </label>
          <button className={buttonClass}>Block</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Gift a subscription</h2>
        <form action={giftSubscription} className="flex flex-wrap items-end gap-3">
          <label>
            Patron email
            <input name="email" type="email" required className={inputClass} />
          </label>
          <label>
            Tier
            <select name="tierId" className={inputClass}>
              {stats.tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>{tier.name}</option>
              ))}
            </select>
          </label>
          <label>
            Duration
            <select name="months" defaultValue="1" className={inputClass}>
              <option value="1">1 month</option>
              <option value="3">3 months</option>
              <option value="6">6 months</option>
              <option value="12">12 months</option>
              <option value="0">No expiry</option>
            </select>
          </label>
          <button className={buttonClass}>Gift</button>
        </form>
      </section>
    </>
  );
}
