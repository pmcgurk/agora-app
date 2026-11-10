import Avatar from "@/components/Avatar";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { addComment, deleteComment } from "@/app/actions/social";
import LikeButton from "@/components/LikeButton";
import CommentForm from "@/components/CommentForm";
import LockedMedia from "@/components/LockedMedia";
import Markdown from "@/components/Markdown";
import ShareButton from "@/components/ShareButton";
import MediaView from "@/components/MediaView";
import { linkClass } from "@/components/ui";
import { canView, getAccessContext } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { creatorPath, getCreator } from "@/lib/creator";
import { getSiteCreator } from "@/lib/instance";
import { prisma } from "@/lib/prisma";
import { isLive, postState } from "@/lib/publishing";
import { recordPostView } from "@/lib/views";
import LocalDateTime from "@/components/LocalDateTime";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ id: string; postId: string }> }) {
  const { id, postId } = await params;
  const creator = await getCreator(id);
  if (!creator) notFound();

  const post = await prisma.post.findFirst({
    where: { id: postId, creatorId: creator.id },
    include: {
      minTier: { select: { name: true, price: true } },
      media: {
        where: { inline: false },
        orderBy: { position: "asc" },
        select: { id: true, kind: true, fileName: true, size: true, blurObjectKey: true, previewObjectKey: true, thumbBlurObjectKey: true },
      },
      _count: { select: { likes: true, comments: true } },
    },
  });
  if (!post) notFound();

  const viewer = await getCurrentUser();
  const access = await getAccessContext(creator.id, viewer);
  // Drafts and scheduled posts do not exist for anyone but their creator.
  if (!access.isOwner && !isLive(post.publishedAt)) notFound();
  const state = postState(post);
  const unlocked = canView(post, access);
  const homeHref = (await getSiteCreator())?.id === creator.id ? "/" : creatorPath(creator);
  if (!access.isOwner) after(() => recordPostView(post.id));

  const [liked, comments] = await Promise.all([
    viewer ? prisma.postLike.findUnique({ where: { postId_userId: { postId: post.id, userId: viewer.id } } }) : null,
    unlocked
      ? prisma.comment.findMany({
          where: { postId: post.id },
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, avatarKey: true, bannerKey: true } }, _count: { select: { likes: true } } },
          take: 200,
        })
      : [],
  ]);

  const likedComments = new Set(
    viewer && comments.length > 0
      ? (
          await prisma.commentLike.findMany({
            where: { userId: viewer.id, commentId: { in: comments.map((comment) => comment.id) } },
            select: { commentId: true },
          })
        ).map((like) => like.commentId)
      : [],
  );

  const CommentItem = ({ comment }: { comment: (typeof comments)[number] }) => (
    <div className="rounded-theme bg-secondary p-3">
      <p className="flex items-center gap-2 text-sm">
        <Avatar user={comment.author} size={24} />
        <strong>{comment.author.name}</strong>{" "}
        <span className="text-muted">{comment.createdAt.toISOString().slice(0, 10)}</span>
      </p>
      <p className="whitespace-pre-wrap">{comment.body}</p>
      <div className="mt-2 flex items-center gap-3">
        {!access.blocked && (
          <LikeButton
            postId={comment.id}
            target="comment"
            initialLiked={likedComments.has(comment.id)}
            initialCount={comment._count.likes}
            mode={viewer ? "ok" : "login"}
          />
        )}
        {viewer && (viewer.id === comment.authorId || access.isOwner) && (
          <form action={deleteComment}>
            <input type="hidden" name="commentId" value={comment.id} />
            <button className="text-sm underline">Delete</button>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <article className="space-y-4">
      <p>
        <Link href={homeHref} className={linkClass}>← All posts</Link>
      </p>
      {state !== "published" && (
        <p role="note" className="rounded-theme bg-secondary p-3 text-sm">
          {state === "draft" ? (
            <>This is a <strong>draft</strong>. Only you can see it until you publish it.</>
          ) : (
            <>This post is <strong>scheduled</strong> for <LocalDateTime value={post.publishedAt!.toISOString()} />. Only you can see it until then.</>
          )}
        </p>
      )}
      <h2 className="text-2xl font-semibold">{post.title}</h2>
      <p className="text-xs text-muted">
        {(post.publishedAt ?? post.createdAt).toISOString().slice(0, 10)}
        {access.isOwner && (
          <>
            {" · "}
            <Link href={`/dashboard/posts/${post.id}/edit`} className={linkClass}>Edit post</Link>
          </>
        )}
      </p>

      {unlocked ? (
        <>
          {post.textContent && <Markdown source={post.textContent} />}
          <div className="space-y-3">{post.media.map((item) => <MediaView key={item.id} item={{ ...item, size: Number(item.size) }} />)}</div>
        </>
      ) : (
        <>
          <p className="text-muted">
            {viewer ? "Follow or subscribe" : "Log in to follow or subscribe"} to unlock this post
            {post.minTier ? ` (${post.minTier.name} and above)` : ""}.
          </p>
          <div className="space-y-3">
            {post.media.map((item) => (
              <LockedMedia
                key={item.id}
                item={{ ...item, size: Number(item.size) }}
                canBlur={post.allowBlurPreview && item.blurObjectKey !== null}
                previewSeconds={item.previewObjectKey ? post.previewSeconds : null}
                hasThumbnail={item.thumbBlurObjectKey !== null}
              />
            ))}
          </div>
        </>
      )}

      <div className="flex items-center gap-3">
        {unlocked && !access.blocked && (
          <LikeButton
            postId={post.id}
            initialLiked={liked !== null}
            initialCount={post._count.likes}
            mode={viewer ? "ok" : "login"}
          />
        )}
        <span className="text-sm text-muted">{post._count.comments} comment{post._count.comments === 1 ? "" : "s"}</span>
        <ShareButton path={`${creatorPath(creator)}/posts/${post.id}`} title={post.title} />
      </div>

      <section id="comments" aria-label="Comments" className="space-y-3">
        <h3 className="text-lg font-semibold">Comments</h3>
        {comments
          .filter((comment) => comment.parentId === null)
          .map((comment) => (
            <div key={comment.id} className="space-y-2">
              <CommentItem comment={comment} />
              {comments
                .filter((reply) => reply.parentId === comment.id)
                .map((reply) => (
                  <div key={reply.id} className="ml-6">
                    <CommentItem comment={reply} />
                  </div>
                ))}
              {viewer && !access.blocked && (
                <details className="ml-6">
                  <summary className="cursor-pointer text-sm text-muted">Reply</summary>
                  <div className="mt-2">
                    <CommentForm postId={post.id} parentId={comment.id} action={addComment} />
                  </div>
                </details>
              )}
            </div>
          ))}
        {unlocked && comments.length === 0 && <p className="text-muted">No comments yet.</p>}
        {unlocked && viewer && !access.blocked && <CommentForm postId={post.id} action={addComment} />}
        {unlocked && !viewer && (
          <p>
            <Link href="/login" className={linkClass}>Log in</Link> to comment.
          </p>
        )}
      </section>
    </article>
  );
}
