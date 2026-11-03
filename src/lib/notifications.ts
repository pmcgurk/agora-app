import { activeSubscriptionWhere } from "@/lib/access";
import { creatorPath } from "@/lib/creator";
import { prisma } from "@/lib/prisma";
import { absoluteUrl, emitEvent } from "@/lib/webhooks";

type Draft = { userId: string; type: string; message: string; href: string };

// Notifications never block the action that caused them.
async function send(drafts: Draft[]): Promise<void> {
  if (drafts.length === 0) return;
  try {
    // Skip anything identical that is still unread, so repeated likes don't pile up.
    const unread = await prisma.notification.findMany({
      where: { readAt: null, userId: { in: drafts.map((draft) => draft.userId) } },
      select: { userId: true, message: true, href: true },
    });
    const seen = new Set(unread.map((item) => `${item.userId}|${item.message}|${item.href}`));
    const fresh = drafts.filter((draft) => !seen.has(`${draft.userId}|${draft.message}|${draft.href}`));
    if (fresh.length > 0) await prisma.notification.createMany({ data: fresh });
  } catch (error) {
    console.error("Could not create notifications", error);
  }
}

const postHref = (creator: { id: string; slug: string | null }, postId: string) =>
  `${creatorPath(creator)}/posts/${postId}`;

export async function notifyLike(postId: string, likerId: string): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, title: true, creator: { select: { id: true, slug: true, notifyLikes: true } } },
  });
  if (!post || post.creator.id === likerId) return;
  const liker = await prisma.user.findUnique({ where: { id: likerId }, select: { name: true } });
  emitEvent(post.creator.id, "like.created", {
    post: { id: post.id, title: post.title, url: absoluteUrl(postHref(post.creator, post.id)) },
    user: { id: likerId, name: liker?.name ?? null },
  });
  if (!post.creator.notifyLikes) return;
  await send([
    {
      userId: post.creator.id,
      type: "like",
      message: `${liker?.name ?? "Someone"} liked "${post.title}"`,
      href: postHref(post.creator, post.id),
    },
  ]);
}

export async function notifyComment(commentId: string): Promise<void> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: {
      author: { select: { id: true, name: true } },
      parent: { select: { author: { select: { id: true, notifyReplies: true } } } },
      post: {
        select: { id: true, title: true, creator: { select: { id: true, slug: true, notifyComments: true } } },
      },
    },
  });
  if (!comment) return;
  const { post, author } = comment;
  const href = `${postHref(post.creator, post.id)}#comments`;
  const drafts: Draft[] = [];
  emitEvent(post.creator.id, "comment.created", {
    comment: { id: comment.id, body: comment.body, parentId: comment.parentId },
    post: { id: post.id, title: post.title, url: absoluteUrl(href) },
    author: { id: author.id, name: author.name },
  });

  const replyTarget = comment.parent?.author;
  if (replyTarget && replyTarget.id !== author.id && replyTarget.notifyReplies) {
    drafts.push({
      userId: replyTarget.id,
      type: "reply",
      message: `${author.name} replied to your comment on "${post.title}"`,
      href,
    });
  }
  // The creator is told about replies to others too, unless they were already told as the parent author.
  if (post.creator.id !== author.id && post.creator.notifyComments && replyTarget?.id !== post.creator.id) {
    drafts.push({
      userId: post.creator.id,
      type: "comment",
      message: `${author.name} commented on "${post.title}"`,
      href,
    });
  }
  await send(drafts);
}

export async function notifyNewMember(patronId: string, tierId: string): Promise<void> {
  const tier = await prisma.tier.findUnique({
    where: { id: tierId },
    select: { name: true, price: true, creator: { select: { id: true } }, mutes: { select: { userId: true } } },
  });
  if (!tier) return;
  const patron = await prisma.user.findUnique({ where: { id: patronId }, select: { name: true } });
  emitEvent(tier.creator.id, "member.joined", {
    member: { id: patronId, name: patron?.name ?? null },
    tier: { id: tierId, name: tier.name, price: tier.price },
  });
  if (tier.mutes.some((mute) => mute.userId === tier.creator.id)) return;
  await send([
    {
      userId: tier.creator.id,
      type: "member",
      message: `${patron?.name ?? "Someone"} ${tier.price === 0 ? "followed you" : `joined ${tier.name}`}`,
      href: "/dashboard/members",
    },
  ]);
}

// Tells everyone who can see the new post (and wants to hear about it).
export async function notifyNewPost(postId: string): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      isPublic: true,
      minTier: { select: { price: true, name: true } },
      creator: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!post) return;
  emitEvent(post.creator.id, "post.created", {
    post: {
      id: post.id,
      title: post.title,
      url: absoluteUrl(postHref(post.creator, post.id)),
      visibility: post.isPublic ? "public" : (post.minTier?.name ?? "private"),
    },
  });
  if (!post.isPublic && !post.minTier) return;
  const subscriptions = await prisma.subscription.findMany({
    where: {
      ...activeSubscriptionWhere(),
      tier: { creatorId: post.creator.id, ...(post.isPublic ? {} : { price: { gte: post.minTier!.price } }) },
      patron: { notifyPosts: true },
    },
    select: { patronId: true },
  });
  const recipients = [...new Set(subscriptions.map((subscription) => subscription.patronId))];
  await send(
    recipients.map((userId) => ({
      userId,
      type: "post",
      message: `${post.creator.name} posted "${post.title}"`,
      href: postHref(post.creator, post.id),
    })),
  );
}

export async function notifyMessage(messageId: string): Promise<void> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { sender: { select: { id: true, name: true } }, recipient: { select: { id: true, role: true } } },
  });
  if (!message) return;
  if (message.recipient.role === "CREATOR") {
    emitEvent(message.recipient.id, "message.received", {
      message: { id: message.id, body: message.body, createdAt: message.createdAt.toISOString() },
      from: { id: message.sender.id, name: message.sender.name },
    });
  }
  await send([
    {
      userId: message.recipient.id,
      type: "message",
      message: `${message.sender.name} sent you a message`,
      href: `/messages/${message.sender.id}`,
    },
  ]);
}

export async function notifyRefund(patronId: string, text: string): Promise<void> {
  await send([{ userId: patronId, type: "refund", message: text, href: "/settings/subscriptions" }]);
}
