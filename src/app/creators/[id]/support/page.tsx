import Link from "next/link";
import { notFound } from "next/navigation";
import EndPlan from "@/components/EndPlan";
import { subscribe } from "@/app/actions/patron";
import Flash from "@/components/Flash";
import { buttonClass, linkClass } from "@/components/ui";
import { activeSubscriptionWhere } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { creatorPath, getCreator } from "@/lib/creator";
import { formatPrice } from "@/lib/currency";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const creator = await getCreator((await params).id);
  if (!creator) notFound();
  const { error } = await searchParams;
  const viewer = await getCurrentUser();

  const [tiers, subscriptions] = await Promise.all([
    prisma.tier.findMany({ where: { creatorId: creator.id }, orderBy: { price: "asc" } }),
    viewer
      ? prisma.subscription.findMany({
          where: { patronId: viewer.id, tier: { creatorId: creator.id }, ...activeSubscriptionWhere() },
          select: { id: true, tierId: true, expiresAt: true, cancelAtPeriodEnd: true, gifted: true },
        })
      : [],
  ]);
  const currentTier =
    tiers.filter((tier) => subscriptions.some((subscription) => subscription.tierId === tier.id)).at(-1) ?? null;
  const currentPlan = subscriptions.find((subscription) => subscription.tierId === currentTier?.id) ?? null;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Support {creator.name}</h2>
        {creator.bio && <p className="mt-1 whitespace-pre-wrap text-muted">{creator.bio}</p>}
      </div>
      <Flash error={error} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map((tier) => (
          <div key={tier.id} className="agora-card agora-tier flex flex-col rounded-theme border border-line bg-surface p-5">
            <h3 className="text-lg font-semibold">{tier.name}</h3>
            <p className="mt-2 text-3xl font-bold text-primary">
              {tier.price === 0 ? "Free" : formatPrice(tier.price, creator.currency)}
              {tier.price > 0 && <span className="text-sm font-normal text-muted"> / month</span>}
            </p>
            <p className="mt-3 flex-1 whitespace-pre-wrap text-muted">
              {tier.description ?? (tier.price === 0 ? "Follow to get updates and see public posts." : "")}
            </p>
            <div className="mt-4">
              {currentTier?.id === tier.id && currentPlan ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-block rounded-theme border border-line px-4 py-2 text-muted">
                    {tier.price === 0 ? "Following" : "Current plan"}
                  </span>
                  {!currentPlan.gifted && <EndPlan subscription={currentPlan} paid={tier.price > 0} returnTo={`${creatorPath(creator)}/support`} />}
                </div>
              ) : currentTier && tier.price === 0 ? (
                <span className="inline-block px-4 py-2 text-muted">Included</span>
              ) : viewer?.role === "PATRON" ? (
                <form action={subscribe}>
                  <input type="hidden" name="tierId" value={tier.id} />
                  <button className={`${buttonClass} w-full`}>{tier.price === 0 ? "Follow" : currentTier ? "Switch" : "Join"}</button>
                </form>
              ) : !viewer ? (
                <Link href="/login" className={linkClass}>Log in to {tier.price === 0 ? "follow" : "join"}</Link>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
