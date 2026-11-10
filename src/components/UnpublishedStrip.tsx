import Link from "next/link";
import LocalDateTime from "@/components/LocalDateTime";
import { linkClass } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { postState, unpublishedWhere } from "@/lib/publishing";

// Shown to the creator, above their own feed: the drafts and scheduled posts nobody else can see yet.
export default async function UnpublishedStrip({ creatorId }: { creatorId: string }) {
  const posts = await prisma.post.findMany({
    where: { creatorId, ...unpublishedWhere() },
    orderBy: [{ publishedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    select: { id: true, title: true, publishedAt: true },
    take: 6,
  });
  if (posts.length === 0) return null;

  return (
    <section aria-label="Your drafts and scheduled posts" className="agora-card space-y-2 rounded-theme border-2 border-dashed border-primary/50 bg-secondary p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Not published yet</h2>
        <p className="text-sm text-muted">Only you can see these.</p>
      </div>
      <ul className="space-y-1">
        {posts.map((post) => (
          <li key={post.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium">
              {postState(post) === "draft" ? "Draft" : <>Scheduled · <LocalDateTime value={post.publishedAt!.toISOString()} /></>}
            </span>
            <Link href={`/dashboard/posts/${post.id}/edit`} className={`${linkClass} font-medium`}>{post.title}</Link>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        <Link href="/dashboard/posts" className={linkClass}>Manage all posts →</Link>
      </p>
    </section>
  );
}
