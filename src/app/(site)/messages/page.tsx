import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSiteCreator, requireInstanceAccess } from "@/lib/instance";
import { prisma } from "@/lib/prisma";
import { linkClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  await requireInstanceAccess();
  const user = await requireUser();
  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { sender: { select: { id: true, name: true } }, recipient: { select: { id: true, name: true } } },
  });

  const threads = new Map<string, { id: string; name: string; last: string; at: Date; unread: number }>();
  for (const message of messages) {
    const other = message.senderId === user.id ? message.recipient : message.sender;
    const thread = threads.get(other.id) ?? { id: other.id, name: other.name, last: message.body, at: message.createdAt, unread: 0 };
    if (message.recipientId === user.id && !message.readAt) thread.unread += 1;
    threads.set(other.id, thread);
  }

  // A patron on a single-creator instance goes straight to their conversation.
  if (user.role === "PATRON" && threads.size === 0) {
    const creator = await getSiteCreator();
    if (creator?.allowDMs) redirect(`/messages/${creator.id}`);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-10">
      <h1 className="text-3xl font-bold text-primary">Messages</h1>
      <ul className="space-y-2">
        {[...threads.values()].map((thread) => (
          <li key={thread.id} className="agora-card flex items-baseline gap-3 rounded-theme border border-line bg-surface p-3">
            <Link href={`/messages/${thread.id}`} className={`${linkClass} font-medium`}>{thread.name}</Link>
            <span className="min-w-0 flex-1 truncate text-muted">{thread.last}</span>
            {thread.unread > 0 && (
              <span className="rounded-full bg-primary px-2 text-xs text-on-primary">{thread.unread}</span>
            )}
          </li>
        ))}
        {threads.size === 0 && <li className="text-muted">No messages yet.</li>}
      </ul>
    </main>
  );
}
