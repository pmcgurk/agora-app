import { route } from "@/lib/api";
import { getCreatorStats } from "@/lib/stats";

export const GET = route(async (_request, user) => {
  const stats = await getCreatorStats(user.id);
  return {
    body: {
      data: {
        currency: user.currency,
        followers: stats.followers,
        paidSubscribers: stats.paidSubscribers,
        giftedSubscribers: stats.giftedSubscribers,
        monthlyRevenue: stats.monthlyRevenueCents,
        posts: stats.postCount,
        mediaFiles: stats.mediaCount,
        storageBytes: stats.storageBytes,
        tiers: stats.perTier.map((row) => ({
          id: row.tier.id,
          name: row.tier.name,
          members: row.members,
          gifted: row.gifted,
          monthlyRevenue: row.monthlyCents,
        })),
      },
    },
  };
});
