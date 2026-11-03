import Link from "next/link";
import { linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { creatorPath } from "@/lib/creator";
import { prisma } from "@/lib/prisma";
import { getViewAnalytics } from "@/lib/views";

export const dynamic = "force-dynamic";

// "2026-11-03" -> "3 Nov". The day keys are UTC dates, so format them in UTC too.
function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default async function AnalyticsPage() {
  const user = await requireUser("CREATOR");
  const [views, posts] = await Promise.all([
    getViewAnalytics(user.id),
    prisma.post.findMany({
      where: { creatorId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, _count: { select: { likes: true, comments: true } } },
    }),
  ]);
  const peak = Math.max(1, ...views.daily.map((day) => day.profile + day.posts));
  const total30 = views.profile30 + views.posts30;
  const cards: [string, number][] = [
    ["Profile, 7 days", views.profile7],
    ["Profile, 30 days", views.profile30],
    ["Post views, 7 days", views.posts7],
    ["Post views, 30 days", views.posts30],
  ];

  return (
    <>
      <h1 className="text-3xl font-bold text-primary">Analytics</h1>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="agora-card rounded-theme border border-line bg-surface p-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-xl font-semibold text-primary">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="agora-card space-y-2 rounded-theme border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Views, last 30 days</h2>
          <p className="text-sm text-muted">
            {total30} total · busiest day {peak > 1 ? peak : 0} views
          </p>
        </div>
        <div className="flex h-32 items-end gap-0.5" role="img" aria-label="Views per day over the last 30 days">
          {views.daily.map((day) => {
            const count = day.profile + day.posts;
            return (
              <div
                key={day.day}
                title={`${formatDay(day.day)}: ${count} views (${day.profile} profile, ${day.posts} post)`}
                style={{ height: count > 0 ? `${Math.max(4, (count / peak) * 100)}%` : "2px" }}
                className={`flex-1 rounded-t-sm ${count > 0 ? "bg-primary" : "bg-line"}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-muted">
          <span>{views.daily[0] ? formatDay(views.daily[0].day) : ""}</span>
          <span>Today</span>
        </div>
      </section>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-muted">
            <th className="py-1">Post</th>
            <th>Views</th>
            <th>Likes</th>
            <th>Comments</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.id} className="border-t border-line">
              <td className="py-1.5">
                <Link href={`${creatorPath(user)}/posts/${post.id}`} className={linkClass}>{post.title}</Link>
              </td>
              <td>{views.perPostTotal.get(post.id) ?? 0}</td>
              <td>{post._count.likes}</td>
              <td>{post._count.comments}</td>
            </tr>
          ))}
          {posts.length === 0 && (
            <tr>
              <td colSpan={4} className="py-2 text-muted">No posts yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
