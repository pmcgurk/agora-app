import Link from "next/link";
import { deletePost } from "@/app/actions/creator";
import ConfirmAction from "@/components/ConfirmAction";
import Flash from "@/components/Flash";
import LocalDateTime from "@/components/LocalDateTime";
import { buttonClass, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { creatorPath } from "@/lib/creator";
import { prisma } from "@/lib/prisma";
import { postState } from "@/lib/publishing";
import { getViewAnalytics } from "@/lib/views";

export const dynamic = "force-dynamic";

async function loadPosts(creatorId: string) {
  return prisma.post.findMany({
    where: { creatorId },
    orderBy: [{ publishedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    include: { minTier: true, _count: { select: { media: { where: { inline: false } }, likes: true, comments: true } } },
  });
}

type Row = Awaited<ReturnType<typeof loadPosts>>[number];

function PostSection({
  id,
  title,
  hint,
  rows,
  pagePath,
  viewsByPost,
}: {
  id: string;
  title: string;
  hint?: string;
  rows: Row[];
  pagePath: string;
  viewsByPost: Map<string, number>;
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div>
        <h2 id={id} className="text-xl font-semibold">
          {title} <span className="text-base font-normal text-muted">({rows.length})</span>
        </h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      <ul className="space-y-3">
        {rows.map((post) => {
          const state = postState(post);
          return (
            <li key={post.id} className="agora-card flex flex-wrap items-center gap-x-3 gap-y-1 rounded-theme border border-line bg-surface p-3">
              <Link href={`${pagePath}/posts/${post.id}`} className={`${linkClass} font-medium`}>{post.title}</Link>
              {state === "scheduled" && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                  Goes live <LocalDateTime value={post.publishedAt!.toISOString()} />
                </span>
              )}
              <span className="text-sm text-muted">
                {post.isPublic ? "public" : post.minTier ? `${post.minTier.name}+` : "private"}
                {post._count.media > 0 ? ` · ${post._count.media} file${post._count.media === 1 ? "" : "s"}` : ""}
                {state === "published" &&
                  ` · ${viewsByPost.get(post.id) ?? 0} views · ${post._count.likes} likes · ${post._count.comments} comments`}
              </span>
              <span className="ml-auto flex items-center gap-3">
                <Link href={`/dashboard/posts/${post.id}/edit`} className="text-sm underline">
                  {state === "published" ? "Edit" : "Edit or publish"}
                </Link>
                <ConfirmAction
                  action={deletePost}
                  fields={{ postId: post.id }}
                  label="Delete"
                  message="Delete this post and its files?"
                />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const user = await requireUser("CREATOR");
  const { error, notice } = await searchParams;
  const [posts, views] = await Promise.all([loadPosts(user.id), getViewAnalytics(user.id)]);

  const drafts = posts.filter((post) => postState(post) === "draft");
  // The next one to go live comes first.
  const scheduled = posts.filter((post) => postState(post) === "scheduled").reverse();
  const published = posts.filter((post) => postState(post) === "published");
  const shared = { pagePath: creatorPath(user), viewsByPost: views.perPostTotal };

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-primary">Posts</h1>
        <Link href="/dashboard/posts/new" className={buttonClass}>New post</Link>
      </div>
      <Flash notice={notice} error={error} />
      <PostSection {...shared} id="drafts" title="Drafts" hint="Saved but not published. Only you can see these." rows={drafts} />
      <PostSection
        {...shared}
        id="scheduled"
        title="Scheduled"
        hint="These go live on their own at the time shown. Only you can see them until then."
        rows={scheduled}
      />
      <PostSection {...shared} id="published" title="Published" rows={published} />
      {posts.length === 0 && <p className="text-muted">No posts yet.</p>}
    </>
  );
}
