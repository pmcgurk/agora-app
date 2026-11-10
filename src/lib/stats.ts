import { activeSubscriptionWhere } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { publishedWhere } from "@/lib/publishing";

export async function getCreatorStats(creatorId: string) {
  const [tiers, subscriptions, postCount, mediaAggregate] = await Promise.all([
    prisma.tier.findMany({ where: { creatorId }, orderBy: { price: "asc" } }),
    prisma.subscription.findMany({
      where: { tier: { creatorId }, ...activeSubscriptionWhere() },
      orderBy: { createdAt: "desc" },
      include: { patron: { select: { id: true, name: true, email: true, avatarKey: true, bannerKey: true } }, tier: true },
    }),
    prisma.post.count({ where: { creatorId, ...publishedWhere() } }),
    prisma.postMedia.aggregate({
      where: { post: { creatorId } },
      _count: true,
      _sum: { size: true },
    }),
  ]);

  const perTier = tiers.map((tier) => {
    const members = subscriptions.filter((subscription) => subscription.tierId === tier.id);
    const paying = members.filter((subscription) => !subscription.gifted);
    return {
      tier,
      members: members.length,
      gifted: members.length - paying.length,
      monthlyCents: tier.price * paying.length,
    };
  });

  return {
    tiers,
    subscriptions,
    perTier,
    // Gifts and free followers never count as revenue. Stripe is not integrated yet, so this is
    // what active paid subscriptions would bring in, not money that has been collected.
    monthlyRevenueCents: perTier.reduce((sum, row) => sum + row.monthlyCents, 0),
    followers: subscriptions.length,
    paidSubscribers: subscriptions.filter((s) => s.tier.price > 0 && !s.gifted).length,
    giftedSubscribers: subscriptions.filter((s) => s.gifted).length,
    postCount,
    mediaCount: mediaAggregate._count,
    storageBytes: Number(mediaAggregate._sum.size ?? 0),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
