import Link from "next/link";
import { after } from "next/server";
import { clearNotifications } from "@/app/actions/notifications";
import { cardClass, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  // Unread items stay highlighted for this visit, then count as read.
  if (items.some((item) => !item.readAt)) {
    after(() => prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } }));
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-primary">Notifications</h1>
        <div className="flex items-center gap-4">
          <Link href="/settings/notifications" className={linkClass}>Settings</Link>
          {items.length > 0 && (
            <form action={clearNotifications}>
              <button className="underline">Clear all</button>
            </form>
          )}
        </div>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className={`${cardClass} flex items-center justify-between gap-3 hover:border-primary ${item.readAt ? "" : "border-primary"}`}
            >
              <span>{item.message}</span>
              <span className="whitespace-nowrap text-xs text-muted">{item.createdAt.toISOString().slice(0, 10)}</span>
            </Link>
          </li>
        ))}
        {items.length === 0 && <li className="text-muted">Nothing yet.</li>}
      </ul>
    </main>
  );
}
