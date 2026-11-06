import Link from "next/link";
import EndPlan from "@/components/EndPlan";
import { subscribe } from "@/app/actions/patron";
import { createTier, updateTier } from "@/app/actions/settings";
import Flash from "@/components/Flash";
import TierEditor from "@/components/TierEditor";
import TipJar from "@/components/TipJar";
import { buttonClass, linkClass, secondaryButtonClass } from "@/components/ui";
import { activeSubscriptionWhere } from "@/lib/access";
import { formatPrice } from "@/lib/currency";
import { paymentMode } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import type { Creator } from "@/lib/creator";
import type { getCurrentUser } from "@/lib/auth";

// The support page: tiers, joining, and (for the owner) the tier editor. It is rendered at /support on a
// single-creator site and at /creators/<page>/support everywhere else.
export default async function SupportView({
  creator,
  viewer,
  supportHref,
  error,
  notice,
  edit,
}: {
  creator: Creator;
  viewer: Awaited<ReturnType<typeof getCurrentUser>>;
  supportHref: string;
  error?: string;
  notice?: string;
  edit?: string;
}) {
  const isOwner = viewer?.id === creator.id;
  // Owners can design their tiers right here; the same editor is on the dashboard's Tiers page.
  const editing = isOwner && edit === "1";

  const [tiers, subscriptions] = await Promise.all([
    prisma.tier.findMany({ where: { creatorId: creator.id }, orderBy: { price: "asc" } }),
    viewer && !isOwner
      ? prisma.subscription.findMany({
          where: { patronId: viewer.id, tier: { creatorId: creator.id }, ...activeSubscriptionWhere() },
          select: { id: true, tierId: true, expiresAt: true, cancelAtPeriodEnd: true, gifted: true },
        })
      : [],
  ]);
  const currentTier =
    tiers.filter((tier) => subscriptions.some((subscription) => subscription.tierId === tier.id)).at(-1) ?? null;
  const currentPlan = subscriptions.find((subscription) => subscription.tierId === currentTier?.id) ?? null;
  const visibleTiers = tiers.filter((tier) => tier.active || tier.id === currentTier?.id);
  const canAddPaid = isOwner && creator.acceptsPayments && (await paymentMode()) !== "off";

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Support {creator.name}</h2>
          {creator.bio && <p className="mt-1 whitespace-pre-wrap text-muted">{creator.bio}</p>}
        </div>
        {isOwner && (
          <Link href={editing ? supportHref : `${supportHref}?edit=1`} className={editing ? secondaryButtonClass : buttonClass}>
            {editing ? "Done editing" : "Edit tiers"}
          </Link>
        )}
      </div>
      <Flash notice={notice} error={error} />

      {editing ? (
        <div className="space-y-6">
          {tiers.map((tier) => (
            <TierEditor
              key={tier.id}
              tier={{
                id: tier.id,
                name: tier.name,
                price: tier.price,
                description: tier.description,
                perks: tier.perks,
                badge: tier.badge,
                highlighted: tier.highlighted,
                welcomeMessage: tier.welcomeMessage,
                active: tier.active,
              }}
              currency={creator.currency}
              action={updateTier}
              returnTo={`${supportHref}?edit=1`}
            />
          ))}
          {canAddPaid && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">New tier</h3>
              <TierEditor currency={creator.currency} action={createTier} returnTo={`${supportHref}?edit=1`} creating />
            </div>
          )}
          <p className="text-sm text-muted">
            Turning tiers on or off, and deleting them, is on the <Link href="/dashboard/tiers" className={linkClass}>Tiers</Link> page.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTiers.map((tier) => (
            <div
              key={tier.id}
              className={`agora-card agora-tier flex flex-col rounded-theme border bg-surface p-5 ${tier.highlighted ? "border-primary ring-2 ring-primary" : "border-line"}`}
            >
              {tier.badge && (
                <span className="mb-2 w-fit rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary">{tier.badge}</span>
              )}
              <h3 className="text-lg font-semibold">{tier.name}</h3>
              <p className="mt-2 text-3xl font-bold text-primary">
                {tier.price === 0 ? "Free" : formatPrice(tier.price, creator.currency)}
                {tier.price > 0 && <span className="text-sm font-normal text-muted"> / month</span>}
              </p>
              {tier.description && <p className="mt-3 whitespace-pre-wrap text-muted">{tier.description}</p>}
              {tier.description === null && tier.price === 0 && (
                <p className="mt-3 text-muted">Follow to get updates and see public posts.</p>
              )}
              {tier.perks.length > 0 && (
                <ul className="mt-4 space-y-1.5 text-sm">
                  {tier.perks.map((perk) => (
                    <li key={perk} className="flex gap-2">
                      <span aria-hidden="true" className="text-primary">✓</span>
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto pt-5">
                {currentTier?.id === tier.id && currentPlan ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-block rounded-theme border border-line px-4 py-2 text-muted">
                      {tier.price === 0 ? "Following" : "Current plan"}
                    </span>
                    {!currentPlan.gifted && <EndPlan subscription={currentPlan} paid={tier.price > 0} returnTo={supportHref} />}
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
      )}
      {!editing && <TipJar creator={creator} returnTo={supportHref} />}
    </section>
  );
}
