import Link from "next/link";
import EndPlan from "@/components/EndPlan";
import Flash from "@/components/Flash";
import { linkClass } from "@/components/ui";
import { activeSubscriptionWhere } from "@/lib/access";
import { creatorPath } from "@/lib/creator";
import { getSiteCreator } from "@/lib/instance";
import { prisma } from "@/lib/prisma";

export async function PatronOverview({
  user,
  error,
  notice,
}: {
  user: { id: string; name: string };
  error?: string;
  notice?: string;
}) {
  const [subscriptions, siteCreator] = await Promise.all([
    prisma.subscription.findMany({
      where: { patronId: user.id, ...activeSubscriptionWhere() },
      include: { tier: { include: { creator: { select: { id: true, slug: true, name: true } } } } },
    }),
    getSiteCreator(),
  ]);

  return (
    <>
      <h1 className="text-3xl font-bold text-primary">Welcome, {user.name}</h1>
      <Flash notice={notice} error={error} />
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your subscriptions</h2>
        <ul className="space-y-2">
          {subscriptions.map((subscription) => (
            <li key={subscription.id} className="flex items-center gap-3">
              <Link href={creatorPath(subscription.tier.creator)} className={linkClass}>
                {subscription.tier.creator.name}
              </Link>
              <span>{subscription.tier.name}{subscription.gifted ? " (gift)" : ""}</span>
              {!subscription.gifted && <EndPlan subscription={subscription} paid={subscription.tier.price > 0} returnTo="/dashboard" />}
            </li>
          ))}
          {subscriptions.length === 0 && (
            <li className="text-muted">
              None yet.{" "}
              <Link href={siteCreator ? creatorPath(siteCreator) : "/"} className={linkClass}>
                {siteCreator ? `Visit ${siteCreator.name}` : "Find creators"}
              </Link>
            </li>
          )}
        </ul>
      </section>
    </>
  );
}
