"use server";

import { blockInDemo } from "@/lib/demo-guard";
import { revalidatePath } from "next/cache";
import { canView, getAccessContext } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { notifyComment, notifyLike } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export type CommentFormState = { error?: string; body?: string; sent?: number };

const MAX_COMMENT_LENGTH = 2000;
const COMMENT_COOLDOWN_MS = 5000;

// Only people who can see a post may like or comment on it.
async function requireAccess(postId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { minTier: { select: { price: true } } },
  });
  if (!post) return null;
  const access = await getAccessContext(post.creatorId, user);
  return canView(post, access) && !access.blocked ? { user, post } : null;
}

function refresh() {
  revalidatePath("/creators/[id]/posts/[postId]", "page");
  revalidatePath("/creators/[id]", "page");
}

export async function toggleLike(formData: FormData): Promise<{ liked: boolean; count: number } | null> {
  await blockInDemo();
  const context = await requireAccess(String(formData.get("postId") ?? ""));
  if (!context) return null;
  const key = { postId_userId: { postId: context.post.id, userId: context.user.id } };
  const existing = await prisma.postLike.findUnique({ where: key });
  if (existing) await prisma.postLike.deleteMany({ where: { postId: context.post.id, userId: context.user.id } });
  else {
    await prisma.postLike.upsert({ where: key, update: {}, create: { postId: context.post.id, userId: context.user.id } });
    await notifyLike(context.post.id, context.user.id);
  }
  return { liked: !existing, count: await prisma.postLike.count({ where: { postId: context.post.id } }) };
}

export async function toggleCommentLike(formData: FormData): Promise<{ liked: boolean; count: number } | null> {
  await blockInDemo();
  const comment = await prisma.comment.findUnique({
    where: { id: String(formData.get("commentId") ?? "") },
    select: { id: true, postId: true },
  });
  if (!comment) return null;
  const context = await requireAccess(comment.postId);
  if (!context) return null;
  const key = { commentId_userId: { commentId: comment.id, userId: context.user.id } };
  const existing = await prisma.commentLike.findUnique({ where: key });
  if (existing) await prisma.commentLike.deleteMany({ where: { commentId: comment.id, userId: context.user.id } });
  else await prisma.commentLike.upsert({ where: key, update: {}, create: { commentId: comment.id, userId: context.user.id } });
  return { liked: !existing, count: await prisma.commentLike.count({ where: { commentId: comment.id } }) };
}

export async function addComment(_previous: CommentFormState, formData: FormData): Promise<CommentFormState> {
  await blockInDemo();
  const body = String(formData.get("body") ?? "").trim();
  const context = await requireAccess(String(formData.get("postId") ?? ""));
  if (!context) return { error: "You need access to this post to comment on it.", body };
  if (!body) return { error: "Write something first." };
  if (body.length > MAX_COMMENT_LENGTH) return { error: `Comments are limited to ${MAX_COMMENT_LENGTH} characters.`, body };

  const latest = await prisma.comment.findFirst({
    where: { authorId: context.user.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (latest && Date.now() - latest.createdAt.getTime() < COMMENT_COOLDOWN_MS) {
    return { error: "You're commenting too fast. Wait a few seconds.", body };
  }

  // Replies attach to a top-level comment on the same post.
  const parentId = String(formData.get("parentId") ?? "");
  const parent = parentId
    ? await prisma.comment.findFirst({ where: { id: parentId, postId: context.post.id, parentId: null }, select: { id: true } })
    : null;
  if (parentId && !parent) return { error: "That comment no longer exists.", body };

  const comment = await prisma.comment.create({
    data: { postId: context.post.id, authorId: context.user.id, body, parentId: parent?.id ?? null },
  });
  await notifyComment(comment.id);
  refresh();
  return { sent: Date.now() };
}

// Authors can delete their own comments; creators can delete any comment on their posts.
export async function deleteComment(formData: FormData) {
  await blockInDemo();
  const user = await getCurrentUser();
  if (!user) return;
  const comment = await prisma.comment.findUnique({
    where: { id: String(formData.get("commentId") ?? "") },
    include: { post: { select: { creatorId: true } } },
  });
  if (!comment || (comment.authorId !== user.id && comment.post.creatorId !== user.id)) return;
  await prisma.comment.delete({ where: { id: comment.id } });
  refresh();
}
