import Link from "next/link";
import CollapsedText from "@/components/CollapsedText";
import FeedMedia, { type FeedItem } from "@/components/FeedMedia";
import LikeButton from "@/components/LikeButton";
import Markdown from "@/components/Markdown";
import ShareButton from "@/components/ShareButton";
import { cardClass, linkClass } from "@/components/ui";
import { canView, getAccessContext } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { creatorPath } from "@/lib/creator";
import type { FeedPost } from "@/lib/feed";
import { prisma } from "@/lib/prisma";

// The post cards of a feed. Used for the first page and for every batch that scrolling loads.
export default async function PostArticles({
  creator,
  posts,
}: {
  creator: { id: string; slug: string | null };
  posts: FeedPost[];
}) {
  const viewer = await getCurrentUser();
  const access = await getAccessContext(creator.id, viewer);
  const base = creatorPath(creator);
  const liked = new Set(
    viewer && posts.length > 0
      ? (await prisma.postLike.findMany({ where: { userId: viewer.id, postId: { in: posts.map((post) => post.id) } }, select: { postId: true } })).map((like) => like.postId)
      : [],
  );

  return (
    <>
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
              {(post.publishedAt ?? post.createdAt).toISOString().slice(0, 10)}
              {!post.isPublic && ` · ${post.minTier ? `${post.minTier.name}+` : "private"}`}
              {unlocked ? "" : " · locked"}
            </p>
            {unlocked && post.textContent && (
              <CollapsedText href={`${base}/posts/${post.id}`}>
                <Markdown source={post.textContent} />
              </CollapsedText>
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
              {access.isOwner && (
                <Link href={`/dashboard/posts/${post.id}/edit`} className="rounded-full border border-line px-3 py-1 hover:border-primary hover:text-primary">
                  Edit post
                </Link>
              )}
              <Link href={`${base}/posts/${post.id}`} className={`${linkClass} ml-auto`}>
                {unlocked ? "View full post" : "View teaser"}
              </Link>
            </div>
          </article>
        );
      })}
    </>
  );
}
