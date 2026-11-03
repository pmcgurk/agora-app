"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isBlocked } from "@/lib/blocks";
import { patronCanMessage } from "@/lib/dm";
import { notifyMessage } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const MAX_MESSAGE_LENGTH = 2000;
const COOLDOWN_MS = 2000;

// Messages only flow between the creator and their patrons, and only while the creator allows DMs.
// The creator can reply to people who wrote to them first.
export async function sendMessage(formData: FormData) {
  const user = await requireUser();
  const toId = String(formData.get("to") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const fail = (message: string): never => redirect(`/messages/${toId}?error=${encodeURIComponent(message)}`);

  const recipient = await prisma.user.findUnique({ where: { id: toId } });
  if (!recipient || recipient.id === user.id || recipient.role === user.role) redirect("/messages");

  const creator = user.role === "CREATOR" ? user : recipient;
  const patron = user.role === "CREATOR" ? recipient : user;
  if (!creator.allowDMs) fail("Direct messages are turned off.");
  if (await isBlocked(creator.id, patron.id)) fail("You can't message this person.");
  if (user.role === "PATRON") {
    const gate = await patronCanMessage(creator, patron.id);
    if (!gate.allowed) fail(gate.reason);
  }
  if (user.role === "CREATOR") {
    const started = await prisma.message.findFirst({
      where: { senderId: patron.id, recipientId: creator.id },
      select: { id: true },
    });
    if (!started) redirect("/messages");
  }

  if (!body) fail("Write something first.");
  if (body.length > MAX_MESSAGE_LENGTH) fail(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);
  const latest = await prisma.message.findFirst({
    where: { senderId: user.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (latest && Date.now() - latest.createdAt.getTime() < COOLDOWN_MS) fail("You're sending too fast.");

  const message = await prisma.message.create({ data: { senderId: user.id, recipientId: recipient.id, body } });
  await notifyMessage(message.id);
  redirect(`/messages/${toId}`);
}
