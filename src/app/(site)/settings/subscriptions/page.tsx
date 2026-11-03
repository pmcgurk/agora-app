import Link from "next/link";
import { redirect } from "next/navigation";
import { openBillingPortal } from "@/app/actions/patron";
import EndPlan from "@/components/EndPlan";
import Flash from "@/components/Flash";
import { linkClass } from "@/components/ui";
import { activeSubscriptionWhere } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { creatorPath } from "@/lib/creator";
import { formatPrice } from "@/lib/currency";
import { paymentMode } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SubscriptionSettings({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser();
  if (user.role !== "PATRON") redirect("/settings/profile");
  const { notice, error } = await searchParams;
  const subscriptions = await prisma.subscription.findMany({
    where: { patronId: user.id, ...activeSubscriptionWhere() },
    include: { tier: { include: { creator: { select: { id: true, slug: true, name: true, currency: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Subscriptions</h2>
      <Flash notice={notice} error={error} />
      <ul className="space-y-3">
        {subscriptions.map((subscription) => (
          <li key={subscription.id} className="flex flex-wrap items-center gap-3 rounded-theme bg-secondary p-3">
            <Link href={creatorPath(subscription.tier.creator)} className={linkClass}>
              {subscription.tier.creator.name}
            </Link>
            <span>
              {subscription.tier.name} · {subscription.gifted ? "gift" : formatPrice(subscription.tier.price, subscription.tier.creator.currency)}
              {subscription.expiresAt && !subscription.cancelAtPeriodEnd ? ` · until ${subscription.expiresAt.toISOString().slice(0, 10)}` : ""}
            </span>
            {!subscription.gifted && <EndPlan subscription={subscription} paid={subscription.tier.price > 0} returnTo="settings" />}
          </li>
        ))}
        {subscriptions.length === 0 && <li className="text-muted">You are not following anyone yet.</li>}
      </ul>
      {(await paymentMode()) === "stripe" && subscriptions.some((subscription) => subscription.tier.price > 0 && !subscription.gifted) && (
        <form action={openBillingPortal}>
          <button className="text-sm underline">Manage billing and invoices</button>
        </form>
      )}
    </section>
  );
}
