import { activeSubscriptionWhere } from "@/lib/access";
import { postPath } from "@/lib/creator";
import { newPostEmail } from "@/lib/email-templates";
import { markdownExcerpt } from "@/lib/excerpt";
import { siteName } from "@/lib/instance";
import { getMailSettings, sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { isLive } from "@/lib/publishing";
import { publicUrl } from "@/lib/urls";

// Emailing new posts to members who asked for them. When a post goes live it is queued for each eligible member
// (one row each, never twice); a timer sends the queue a few at a time, so a long list never holds anything up
// and a restart loses nothing.

export const SEND_BATCH = 50;
export const MAX_ATTEMPTS = 3;

// Queues the post for every member who is allowed to read it, follows the creator, has confirmed their address
// and asked for emails. Does nothing on a site that cannot send email.
export async function queuePostEmails(postId: string): Promise<number> {
  if (!(await getMailSettings())) return 0;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, creatorId: true, isPublic: true, minTier: { select: { price: true } } },
  });
  if (!post) return 0;
  // A post that is neither public nor tied to a tier is for its creator alone.
  if (!post.isPublic && !post.minTier) return 0;

  const subscriptions = await prisma.subscription.findMany({
    where: {
      ...activeSubscriptionWhere(),
      tier: { creatorId: post.creatorId, ...(post.isPublic ? {} : { price: { gte: post.minTier!.price } }) },
      patron: { emailPosts: true, emailVerifiedAt: { not: null } },
    },
    select: { patronId: true },
  });
  const recipients = [...new Set(subscriptions.map((subscription) => subscription.patronId))].filter((id) => id !== post.creatorId);
  if (recipients.length === 0) return 0;
  const created = await prisma.postEmail.createMany({ data: recipients.map((userId) => ({ postId, userId })), skipDuplicates: true });
  return created.count;
}

// Sends the next few queued emails. Called every minute by the publisher timer.
export async function sendQueuedPostEmails(limit = SEND_BATCH): Promise<{ sent: number; failed: number; skipped: number }> {
  const result = { sent: 0, failed: 0, skipped: 0 };
  if (!(await getMailSettings())) return result;
  const queued = await prisma.postEmail.findMany({
    where: { sentAt: null, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      user: { select: { id: true, name: true, email: true, emailPosts: true, emailVerifiedAt: true, unsubscribeToken: true } },
      post: { select: { id: true, slug: true, title: true, textContent: true, publishedAt: true, creator: { select: { id: true, name: true, slug: true } } } },
    },
  });
  if (queued.length === 0) return result;
  const site = await siteName();

  for (const row of queued) {
    // Skip (and close out) anything that is no longer wanted: they unsubscribed, or the post went back to a draft.
    if (!row.user.emailPosts || !row.user.emailVerifiedAt || !isLive(row.post.publishedAt)) {
      await prisma.postEmail.update({ where: { id: row.id }, data: { sentAt: new Date(), lastError: "skipped" } });
      result.skipped++;
      continue;
    }
    // Count the attempt first, so a crash halfway never turns into endless retries.
    const claimed = await prisma.postEmail.updateMany({ where: { id: row.id, sentAt: null }, data: { attempts: { increment: 1 } } });
    if (claimed.count !== 1) continue;
    const message = newPostEmail({
      to: row.user.email,
      siteName: site,
      creatorName: row.post.creator.name,
      title: row.post.title,
      excerpt: markdownExcerpt(row.post.textContent, 280),
      postUrl: publicUrl(await postPath(row.post.creator, row.post)),
      unsubscribeUrl: publicUrl(`/unsubscribe/${row.user.unsubscribeToken}`),
      oneClickUnsubscribeUrl: publicUrl(`/api/unsubscribe/${row.user.unsubscribeToken}`),
    });
    const sent = await sendMail(message);
    if (sent.ok) {
      await prisma.postEmail.update({ where: { id: row.id }, data: { sentAt: new Date(), lastError: null } });
      result.sent++;
    } else {
      await prisma.postEmail.update({ where: { id: row.id }, data: { lastError: sent.error.slice(0, 200) } });
      result.failed++;
    }
  }
  return result;
}

const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

// Stops new-post emails for whoever the unsubscribe link belongs to. Anyone holding the link can do it,
// which is the point: it has to work from the email, without logging in.
export async function unsubscribeByToken(token: string): Promise<{ name: string } | null> {
  if (!TOKEN_SHAPE.test(token)) return null;
  const user = await prisma.user.findUnique({ where: { unsubscribeToken: token }, select: { id: true, name: true } });
  if (!user) return null;
  await prisma.user.update({ where: { id: user.id }, data: { emailPosts: false } });
  return { name: user.name };
}

export async function findUnsubscribeTarget(token: string): Promise<{ name: string; subscribed: boolean } | null> {
  if (!TOKEN_SHAPE.test(token)) return null;
  const user = await prisma.user.findUnique({ where: { unsubscribeToken: token }, select: { name: true, emailPosts: true } });
  return user ? { name: user.name, subscribed: user.emailPosts } : null;
}
