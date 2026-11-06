import EndPlan from "@/components/EndPlan";
import Link from "next/link";
import { after } from "next/server";
import FeedMedia, { type FeedItem } from "@/components/FeedMedia";
import LikeButton from "@/components/LikeButton";
import Markdown from "@/components/Markdown";
import ShareButton from "@/components/ShareButton";
import TipJar from "@/components/TipJar";
import Flash from "@/components/Flash";
import { buttonClass, cardClass, linkClass } from "@/components/ui";
import { activeSubscriptionWhere, canView, getAccessContext } from "@/lib/access";
import { patronCanMessage } from "@/lib/dm";
import { getCurrentUser } from "@/lib/auth";
import { getSiteCreator } from "@/lib/instance";
import { creatorPath, getCreator, supportPath } from "@/lib/creator";
import { prisma } from "@/lib/prisma";
import { recordProfileView } from "@/lib/views";

type Creator = NonNullable<Awaited<ReturnType<typeof getCreator>>>;

export default async function CreatorFeed({
  creator,
  notice,
  error,
}: {
  creator: Creator;
  notice?: string;
  error?: string;
}) {
  const viewer = await getCurrentUser();
  const access = await getAccessContext(creator.id, viewer);
  if (!access.isOwner) after(() => recordProfileView(creator.id));

  const [tiers, posts, subscriptions] = await Promise.all([
    prisma.tier.findMany({ where: { creatorId: creator.id }, orderBy: { price: "asc" } }),
    prisma.post.findMany({
      where: { creatorId: creator.id },
      orderBy: { createdAt: "desc" },
      include: {
        minTier: { select: { name: true, price: true } },
        media: {
          where: { inline: false },
          orderBy: { position: "asc" },
          select: { id: true, kind: true, fileName: true, size: true, blurObjectKey: true, previewObjectKey: true, thumbBlurObjectKey: true },
        },
        _count: { select: { likes: true, comments: true, media: { where: { inline: false } } } },
      },
    }),
    viewer
      ? prisma.subscription.findMany({
          where: { patronId: viewer.id, tier: { creatorId: creator.id }, ...activeSubscriptionWhere() },
          select: { id: true, tierId: true, expiresAt: true, cancelAtPeriodEnd: true, gifted: true },
        })
      : [],
  ]);
  const liked = new Set(
    viewer
      ? (await prisma.postLike.findMany({ where: { userId: viewer.id, postId: { in: posts.map((post) => post.id) } }, select: { postId: true } })).map((like) => like.postId)
      : [],
  );
  const memberTier =
    tiers.filter((tier) => subscriptions.some((subscription) => subscription.tierId === tier.id)).at(-1) ?? null;
  const memberPlan = subscriptions.find((subscription) => subscription.tierId === memberTier?.id) ?? null;
  const base = creatorPath(creator);
  const supportHref = await supportPath(creator);
  const dmGate =
    viewer !== null && viewer.id !== creator.id && viewer.role === "PATRON" && !access.blocked
      ? await patronCanMessage(creator, viewer.id)
      : null;
  const canMessage = dmGate?.allowed === true;
  const dmLocked = dmGate && !dmGate.allowed && creator.allowDMs ? dmGate.reason : null;

  return (
    <>
      {creator.bio && <p className="whitespace-pre-wrap">{creator.bio}</p>}
      <Flash notice={notice} error={error} />

      <TipJar creator={creator} returnTo={(await getSiteCreator())?.id === creator.id ? "/" : base} />

      {tiers.length > 0 && (
        <section aria-label="Membership" className={`${cardClass} agora-tier flex flex-wrap items-center justify-between gap-3`}>
          <p>
            {memberTier
              ? memberTier.price === 0
                ? "You follow this creator."
                : `You're a ${memberTier.name} member.`
              : `Support ${creator.name}`}
          </p>
          {memberPlan && !memberPlan.gifted && memberTier && viewer?.role === "PATRON" && (
            <EndPlan subscription={memberPlan} paid={memberTier.price > 0} returnTo={base} />
          )}
          {dmLocked && <span className="text-sm text-muted">{dmLocked}</span>}
          {canMessage && <Link href={`/messages/${creator.id}`} className={linkClass}>Message</Link>}
          {viewer?.id !== creator.id && (
            <Link href={supportHref} className={memberTier ? linkClass : buttonClass}>
              {memberTier ? "Change plan" : "See tiers"}
            </Link>
          )}
        </section>
      )}

      <section aria-label="Posts" className="space-y-4">
        {posts.map((post) => {
          const unlocked = canView(post, access);
          const items: FeedItem[] = post.media.map((item) => ({
            id: item.id,
            kind: item.kind,
            fileName: item.fileName,
            size: Number(item.size),
            canBlur: post.allowBlurPreview && item.blurObjectKey !== null,
            previewSeconds: item.previewObjectKey ? post.previewSeconds : null,
            hasThumbnail: item.thumbBlurObjectKey !== null,
          }));
          return (
            <article key={post.id} className={`${cardClass} agora-post`}>
              <h2 className="text-xl font-semibold">
                <Link href={`${base}/posts/${post.id}`}>{post.title}</Link>
              </h2>
              <p className="text-xs text-muted">
                {post.createdAt.toISOString().slice(0, 10)}
                {!post.isPublic && ` · ${post.minTier ? `${post.minTier.name}+` : "private"}`}
                {unlocked ? "" : " · locked"}
              </p>
              {unlocked && post.textContent && (
                <Markdown source={post.textContent} className="mt-2 max-h-48 overflow-hidden" />
              )}
              <FeedMedia items={items} unlocked={unlocked} />
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
                {unlocked && !access.blocked && (
                  <LikeButton
                    postId={post.id}
                    initialLiked={liked.has(post.id)}
                    initialCount={post._count.likes}
                    mode={viewer ? "ok" : "login"}
                  />
                )}
                <Link
                  href={`${base}/posts/${post.id}#comments`}
                  className="agora-comments-link inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 hover:border-primary hover:text-primary"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.8 7L3 20.5l1.5-5.2A8 8 0 1 1 21 12z" /></svg>
                  {post._count.comments}
                </Link>
                <ShareButton path={`${base}/posts/${post.id}`} title={post.title} />
                <Link href={`${base}/posts/${post.id}`} className={`${linkClass} ml-auto`}>
                  {unlocked ? "View full post" : "View teaser"}
                </Link>
              </div>
            </article>
          );
        })}
        {posts.length === 0 && <p className="text-muted">No posts yet.</p>}
      </section>
    </>
  );
}
