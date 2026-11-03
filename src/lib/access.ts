import { isBlocked } from "@/lib/blocks";
import { prisma } from "@/lib/prisma";

// A subscription grants access while ACTIVE and not past its optional expiry (gifts expire).
export function activeSubscriptionWhere() {
  return {
    status: "ACTIVE" as const,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
}

export type AccessContext = {
  isOwner: boolean;
  // Highest price among the viewer's active tiers for this creator; null when not subscribed.
  maxActiveTierPrice: number | null;
  // Blocked viewers keep seeing public posts but lose tier access and cannot interact.
  blocked?: boolean;
};

type GatedPost = { isPublic: boolean; minTier: { price: number } | null };

export async function getAccessContext(
  creatorId: string,
  viewer: { id: string } | null,
): Promise<AccessContext> {
  if (!viewer) return { isOwner: false, maxActiveTierPrice: null };
  if (viewer.id === creatorId) return { isOwner: true, maxActiveTierPrice: null };

  if (await isBlocked(creatorId, viewer.id)) return { isOwner: false, maxActiveTierPrice: null, blocked: true };

  const best = await prisma.subscription.findFirst({
    where: { patronId: viewer.id, ...activeSubscriptionWhere(), tier: { creatorId } },
    orderBy: { tier: { price: "desc" } },
    select: { tier: { select: { price: true } } },
  });
  return { isOwner: false, maxActiveTierPrice: best?.tier.price ?? null };
}

// Higher-priced tiers include everything in cheaper tiers of the same creator.
// A non-public post without a valid tier is visible to its creator only.
export function canView(post: GatedPost, access: AccessContext): boolean {
  if (post.isPublic || access.isOwner) return true;
  if (!post.minTier || access.maxActiveTierPrice === null) return false;
  return access.maxActiveTierPrice >= post.minTier.price;
}
