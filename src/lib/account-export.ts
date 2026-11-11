import { prisma } from "@/lib/prisma";

// Everything Agora holds about one account, as a plain JSON document the person can keep. It leaves out what is
// not theirs to take: password hashes, sign-in sessions, API key hashes, and other people's email addresses.
export async function buildAccountExport(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerifiedAt: true,
      slug: true,
      tagline: true,
      bio: true,
      currency: true,
      socialLinks: true,
      notifyComments: true,
      notifyLikes: true,
      notifyPosts: true,
      notifyReplies: true,
      allowDMs: true,
    },
  });
  if (!user) return null;

  const [subscriptions, payments, comments, likes, sent, received, notifications, posts, tiers] = await Promise.all([
    prisma.subscription.findMany({
      where: { patronId: userId },
      select: { status: true, gifted: true, createdAt: true, expiresAt: true, cancelAtPeriodEnd: true, tier: { select: { name: true, price: true, creator: { select: { name: true } } } } },
    }),
    prisma.payment.findMany({
      where: { patronId: userId },
      orderBy: { createdAt: "asc" },
      select: { kind: true, amount: true, currency: true, status: true, message: true, tipperName: true, createdAt: true, refundedAt: true, creator: { select: { name: true } } },
    }),
    prisma.comment.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: "asc" },
      select: { body: true, createdAt: true, post: { select: { title: true } } },
    }),
    prisma.postLike.findMany({ where: { userId }, select: { createdAt: true, post: { select: { title: true } } } }),
    prisma.message.findMany({ where: { senderId: userId }, orderBy: { createdAt: "asc" }, select: { body: true, createdAt: true, recipient: { select: { name: true } } } }),
    prisma.message.findMany({ where: { recipientId: userId }, orderBy: { createdAt: "asc" }, select: { body: true, createdAt: true, sender: { select: { name: true } } } }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { type: true, message: true, createdAt: true } }),
    user.role === "CREATOR"
      ? prisma.post.findMany({
          where: { creatorId: userId },
          orderBy: { createdAt: "asc" },
          select: { title: true, slug: true, textContent: true, isPublic: true, createdAt: true, publishedAt: true, editedAt: true, minTier: { select: { name: true } } },
        })
      : Promise.resolve([]),
    user.role === "CREATOR"
      ? prisma.tier.findMany({ where: { creatorId: userId }, orderBy: { price: "asc" }, select: { name: true, price: true, description: true, perks: true } })
      : Promise.resolve([]),
  ]);

  return {
    about: "Everything Agora holds about this account. Passwords, sessions and other people's email addresses are not included.",
    exportedAt: new Date().toISOString(),
    account: user,
    memberships: subscriptions.map((s) => ({
      creator: s.tier.creator.name,
      tier: s.tier.name,
      price: s.tier.price,
      status: s.status,
      gifted: s.gifted,
      startedAt: s.createdAt,
      endsAt: s.expiresAt,
      cancelsAtPeriodEnd: s.cancelAtPeriodEnd,
    })),
    payments: payments.map((p) => ({ creator: p.creator.name, kind: p.kind, amount: p.amount, currency: p.currency, status: p.status, tipperName: p.tipperName, message: p.message, date: p.createdAt, refundedAt: p.refundedAt })),
    comments: comments.map((c) => ({ post: c.post.title, body: c.body, date: c.createdAt })),
    likes: likes.map((l) => ({ post: l.post.title, date: l.createdAt })),
    messagesSent: sent.map((m) => ({ to: m.recipient.name, body: m.body, date: m.createdAt })),
    messagesReceived: received.map((m) => ({ from: m.sender.name, body: m.body, date: m.createdAt })),
    notifications: notifications.map((n) => ({ type: n.type, message: n.message, date: n.createdAt })),
    ...(user.role === "CREATOR"
      ? {
          posts: posts.map((p) => ({ title: p.title, address: p.slug, text: p.textContent, public: p.isPublic, visibleTo: p.minTier?.name ?? null, created: p.createdAt, published: p.publishedAt, edited: p.editedAt })),
          tiers,
        }
      : {}),
  };
}
