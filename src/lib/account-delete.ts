import { stripeConfigured } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/s3";
import { getStripe } from "@/lib/stripe";
import { endPlan } from "@/lib/subscriptions";

// Comments that other people replied to cannot simply vanish without taking their replies with them, so they
// are kept as "[deleted]" under this placeholder account, which nobody can sign in to.
export const DELETED_USER_ID = "deleted-user";

async function ensureDeletedUser(): Promise<void> {
  await prisma.user.upsert({
    where: { id: DELETED_USER_ID },
    update: {},
    create: {
      id: DELETED_USER_ID,
      name: "Deleted user",
      email: "deleted-user@agora.invalid",
      // Not a valid hash of anything, so no password ever matches.
      passwordHash: "!",
      role: "PATRON",
      emailVerifiedAt: new Date(),
    },
  });
}

// Deletes a member's account and the personal data tied to it:
// - paid plans are ended first, in Stripe too; if that fails nothing is deleted, so nobody keeps being billed
//   for an account that is gone (the error is passed on);
// - the creator keeps their payment records, without the member's name, message or link to the account;
// - comments other people replied to stay as "[deleted]", the rest are removed;
// - everything else (likes, messages, notifications, sessions, blocks, plans) goes with the account.
// Creators are not handled here: deleting one would delete their whole page.
export async function deleteAccountData(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true, bannerKey: true, stripeCustomerId: true } });
  if (!user) return;

  const plans = await prisma.subscription.findMany({ where: { patronId: userId, status: { in: ["ACTIVE", "PAST_DUE"] } }, select: { id: true } });
  for (const plan of plans) await endPlan(plan.id, { atPeriodEnd: false });

  // Stripe keeps its own payment records, but the customer record (name, email) can go.
  if (user.stripeCustomerId && (await stripeConfigured())) {
    await (await getStripe()).customers.del(user.stripeCustomerId).catch((error) => console.error("Removing the Stripe customer failed:", error instanceof Error ? error.message : error));
  }

  await ensureDeletedUser();
  await prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({ where: { patronId: userId }, data: { patronId: null, tipperName: null, message: null } });
    const threads = await tx.comment.findMany({ where: { authorId: userId, replies: { some: {} } }, select: { id: true } });
    if (threads.length > 0) {
      await tx.comment.updateMany({ where: { id: { in: threads.map((thread) => thread.id) } }, data: { authorId: DELETED_USER_ID, body: "[deleted]" } });
    }
    await tx.user.delete({ where: { id: userId } });
  });

  // Their pictures are removed from storage; failing to is not worth undoing a deletion for.
  for (const key of [user.avatarKey, user.bannerKey]) {
    if (key) await deleteObject(key).catch((error) => console.error("Removing a picture from storage failed:", error instanceof Error ? error.message : error));
  }
}
