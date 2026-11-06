import Link from "next/link";
import { deletePost } from "@/app/actions/creator";
import ConfirmAction from "@/components/ConfirmAction";
import Flash from "@/components/Flash";
import { buttonClass, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { creatorPath } from "@/lib/creator";
import { prisma } from "@/lib/prisma";
import { getViewAnalytics } from "@/lib/views";

export const dynamic = "force-dynamic";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const user = await requireUser("CREATOR");
  const { error, notice } = await searchParams;
  const [posts, views] = await Promise.all([
    prisma.post.findMany({
      where: { creatorId: user.id },
      orderBy: { createdAt: "desc" },
      include: { minTier: true, _count: { select: { media: { where: { inline: false } }, likes: true, comments: true } } },
    }),
    getViewAnalytics(user.id),
  ]);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-primary">Posts</h1>
        <Link href="/dashboard/posts/new" className={buttonClass}>New post</Link>
      </div>
      <Flash notice={notice} error={error} />
      <ul className="space-y-3">
        {posts.map((post) => (
          <li key={post.id} className="agora-card flex flex-wrap items-center gap-x-3 gap-y-1 rounded-theme border border-line bg-surface p-3">
            <Link href={`${creatorPath(user)}/posts/${post.id}`} className={`${linkClass} font-medium`}>{post.title}</Link>
            <span className="text-sm text-muted">
              {post.isPublic ? "public" : post.minTier ? `${post.minTier.name}+` : "private"}
              {post._count.media > 0 ? ` · ${post._count.media} file${post._count.media === 1 ? "" : "s"}` : ""}
              {` · ${views.perPostTotal.get(post.id) ?? 0} views · ${post._count.likes} likes · ${post._count.comments} comments`}
            </span>
            <span className="ml-auto flex items-center gap-3">
              <Link href={`/dashboard/posts/${post.id}/edit`} className="text-sm underline">Edit</Link>
              <ConfirmAction
                action={deletePost}
                fields={{ postId: post.id }}
                label="Delete"
                message="Delete this post and its files?"
              />
            </span>
          </li>
        ))}
        {posts.length === 0 && <li className="text-muted">No posts yet.</li>}
      </ul>
    </>
  );
}
