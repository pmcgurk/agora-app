import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Tells a signed-in patron their card needs attention, on every page, until it is fixed. Only shown while a plan has
// a failed payment on it, so most people never see it and it costs one small query for the rest.
export default async function PaymentBanner() {
  const user = await getCurrentUser();
  if (!user) return null;
  const plan = await prisma.subscription.findFirst({
    where: { patronId: user.id, OR: [{ status: "PAST_DUE" }, { status: "ACTIVE", paymentFailedAt: { not: null } }] },
    orderBy: { paymentFailedAt: "asc" },
    select: { status: true, expiresAt: true, tier: { select: { name: true, creator: { select: { name: true } } } } },
  });
  if (!plan) return null;

  const stillHasAccess = plan.status === "ACTIVE" && (!plan.expiresAt || plan.expiresAt > new Date());
  return (
    <div role="region" aria-label="Payment problem" className="border-b border-danger bg-danger/10 px-4 py-2 text-center text-sm text-text">
      {stillHasAccess && plan.expiresAt
        ? `Your payment for ${plan.tier.creator.name} (${plan.tier.name}) didn’t go through. You keep access until ${plan.expiresAt.toISOString().slice(0, 10)}.`
        : `Your payment for ${plan.tier.creator.name} (${plan.tier.name}) didn’t go through, so your access has paused.`}{" "}
      <Link href="/settings/subscriptions" className="agora-link font-medium text-danger underline">Update your card</Link>
    </div>
  );
}
