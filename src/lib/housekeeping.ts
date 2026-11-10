import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

// Clears out rows that can never be used again: sessions that have expired and email links that have been
// used or have expired. Without this they would only pile up. Safe to run as often as you like.
export async function cleanExpired(now = new Date()): Promise<{ sessions: number; tokens: number }> {
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const [sessions, tokens] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    // Kept for a day after use or expiry, so a link opened twice still gets a sensible message.
    prisma.emailToken.deleteMany({ where: { OR: [{ expiresAt: { lt: dayAgo } }, { usedAt: { lt: dayAgo } }] } }),
  ]);
  return { sessions: sessions.count, tokens: tokens.count };
}
