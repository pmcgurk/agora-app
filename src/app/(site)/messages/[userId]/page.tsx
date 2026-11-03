import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { sendMessage } from "@/app/actions/messages";
import Avatar from "@/components/Avatar";
import Flash from "@/components/Flash";
import { buttonClass, inputClass, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { patronCanMessage } from "@/lib/dm";
import { isBlocked } from "@/lib/blocks";
import { requireInstanceAccess } from "@/lib/instance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireInstanceAccess();
  const user = await requireUser();
  const { userId } = await params;
  const { error } = await searchParams;
  const other = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, allowDMs: true, dmMinTierId: true, avatarKey: true, bannerKey: true } });
  if (!other || other.id === user.id || other.role === user.role) notFound();

  const creator = user.role === "CREATOR" ? user : other;
  const patronId = user.role === "CREATOR" ? other.id : user.id;
  const where = {
    OR: [
      { senderId: user.id, recipientId: other.id },
      { senderId: other.id, recipientId: user.id },
    ],
  };
  const [messages, blocked] = await Promise.all([
    prisma.message.findMany({ where, orderBy: { createdAt: "asc" }, take: 200 }),
    isBlocked(creator.id, patronId),
  ]);
  if (user.role === "CREATOR" && messages.length === 0) redirect("/messages");
  await prisma.message.updateMany({ where: { senderId: other.id, recipientId: user.id, readAt: null }, data: { readAt: new Date() } });

  const gate = user.role === "PATRON" ? await patronCanMessage(creator, user.id) : { allowed: creator.allowDMs };
  const canSend = gate.allowed && !blocked;
  const reason = !gate.allowed && "reason" in gate ? gate.reason : "Direct messages are not available.";

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-10">
      <p>
        {user.role === "CREATOR" && <Link href="/messages" className={linkClass}>← All messages</Link>}
      </p>
      <h1 className="flex items-center gap-3 text-3xl font-bold text-primary">
        <Avatar user={other} size={40} />
        {other.name}
      </h1>
      <Flash error={error} />
      <ul className="space-y-2">
        {messages.map((message) => (
          <li
            key={message.id}
            className={`agora-message max-w-[85%] whitespace-pre-wrap rounded-theme p-3 ${
              message.senderId === user.id ? "ml-auto bg-primary text-on-primary" : "bg-secondary"
            }`}
          >
            {message.body}
          </li>
        ))}
        {messages.length === 0 && <li className="text-muted">Say hello.</li>}
      </ul>
      {canSend ? (
        <form action={sendMessage} className="space-y-2">
          <input type="hidden" name="to" value={other.id} />
          <textarea name="body" required maxLength={2000} rows={3} aria-label="Message" className={inputClass} />
          <button className={buttonClass}>Send</button>
        </form>
      ) : (
        <p className="text-muted">{reason}</p>
      )}
    </main>
  );
}
