import { activeSubscriptionWhere } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export type DmGate = { allowed: true } | { allowed: false; reason: string };

// Patrons may message a creator when DMs are on and, if a minimum tier is set, they hold that tier
// or a more expensive one. Creators replying to patrons are never gated.
export async function patronCanMessage(
  creator: { id: string; allowDMs: boolean; dmMinTierId: string | null },
  patronId: string,
): Promise<DmGate> {
  if (!creator.allowDMs) return { allowed: false, reason: "Direct messages are turned off." };
  if (!creator.dmMinTierId) return { allowed: true };
  const minTier = await prisma.tier.findFirst({
    where: { id: creator.dmMinTierId, creatorId: creator.id },
    select: { name: true, price: true },
  });
  if (!minTier) return { allowed: true };
  const best = await prisma.subscription.findFirst({
    where: { patronId, ...activeSubscriptionWhere(), tier: { creatorId: creator.id, price: { gte: minTier.price } } },
    select: { id: true },
  });
  return best ? { allowed: true } : { allowed: false, reason: `Messaging is for ${minTier.name} members and above.` };
}
