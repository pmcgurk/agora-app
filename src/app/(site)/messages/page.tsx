import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSiteCreator, requireInstanceAccess } from "@/lib/instance";
import { prisma } from "@/lib/prisma";
import { cardClass } from "@/components/ui";

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
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold text-primary">Messages</h1>
        <p className="text-sm text-muted">Direct conversations.</p>
      </div>
      {threads.size > 0 ? (
        <ul className="agora-card divide-y divide-line overflow-hidden rounded-theme border border-line bg-surface">
          {[...threads.values()].map((thread) => (
            <li key={thread.id}>
              <Link href={`/messages/${thread.id}`} className="flex items-center gap-3 p-4 hover:bg-secondary">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-text">{thread.name}</span>
                  <span className="block truncate text-sm text-muted">{thread.last}</span>
                </span>
                {thread.unread > 0 && (
                  <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary">
                    {thread.unread} new
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className={`${cardClass} space-y-2 p-6 text-center`}>
          <p className="font-medium">No messages yet.</p>
          <p className="text-sm text-muted">
            {user.role === "CREATOR"
              ? "When a supporter writes to you, their conversation shows up here."
              : "Start a conversation from a creator's page, if they accept messages."}
          </p>
        </div>
      )}
    </main>
  );
}
