"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth";
import { DEMO_CREATOR_EMAIL, DEMO_SUPPORTER_EMAIL, isDemoMode, waitlistEmail } from "@/lib/demo";
import { sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { clientIp, withinLimit } from "@/lib/rate-limit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Picks a way to look at the demo: the setup wizard from the start, the creator's dashboard, a
// supporter on a paid tier, or a signed-out visitor.
export async function enterDemo(formData: FormData) {
  if (!isDemoMode()) redirect("/");
  if (!withinLimit(`demo-enter:${await clientIp()}`, 60, 60 * 60 * 1000)) redirect("/demo?error=" + encodeURIComponent("Too many tries. Please wait a few minutes."));

  const view = String(formData.get("view") ?? "");
  await destroySession();
  if (view === "wizard") redirect("/setup");
  if (view === "visitor") redirect("/");

  const email = view === "dashboard" ? DEMO_CREATOR_EMAIL : view === "supporter" ? DEMO_SUPPORTER_EMAIL : null;
  if (!email) redirect("/demo");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) redirect("/demo?error=" + encodeURIComponent("The demo is resetting. Try again in a few seconds."));
  await createSession(user.id);
  redirect(view === "dashboard" ? "/dashboard" : "/");
}

export type WaitlistState = { done?: boolean; error?: string };

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// Collects an email for the hosted-Agora waitlist. Every address is stored, and the owner is emailed
// about new ones when outgoing mail is set up.
export async function joinWaitlist(_previous: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const destination = waitlistEmail();
  if (!isDemoMode() || !destination) return { error: "The waitlist is closed." };
  // A hidden field only bots fill in: pretend it worked.
  if (String(formData.get("website") ?? "")) return { done: true };
  if (!withinLimit(`waitlist:${await clientIp()}`, 5, 60 * 60 * 1000)) return { error: "Too many tries. Please wait a while and try again." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return { error: "Enter a valid email address." };

  const existing = await prisma.waitlistEntry.findUnique({ where: { email }, select: { id: true } });
  if (!existing) {
    await prisma.waitlistEntry.create({ data: { email } });
    const total = await prisma.waitlistEntry.count();
    await sendMail({
      to: destination,
      subject: `Agora waitlist: ${email}`,
      text: `${email} joined the hosted Agora waitlist. ${total} on the list now.`,
      html: `<p><strong>${escapeHtml(email)}</strong> joined the hosted Agora waitlist. ${total} on the list now.</p>`,
    });
  }
  return { done: true };
}
