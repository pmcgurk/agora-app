"use server";

import { redirect } from "next/navigation";
import { mailIsConfigured } from "@/lib/account-email";
import { blockInDemo } from "@/lib/demo-guard";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { unsubscribeByToken } from "@/lib/post-emails";
import { prisma } from "@/lib/prisma";
import { clientIp, withinLimit } from "@/lib/rate-limit";

export async function clearNotifications() {
  await blockInDemo();
  const user = await requireUser();
  await prisma.notification.deleteMany({ where: { userId: user.id } });
  revalidatePath("/notifications");
}

// Stops new-post emails from the link in one of them. No login needed: the secret in the link is the proof.
export async function unsubscribe(formData: FormData) {
  await blockInDemo();
  if (!withinLimit(`unsubscribe-page:${await clientIp()}`, 60, 60 * 60 * 1000)) redirect("/");
  const token = String(formData.get("token") ?? "");
  await unsubscribeByToken(token);
  redirect(`/unsubscribe/${encodeURIComponent(token)}?done=1`);
}

// Turns new-post emails on or off for the signed-in member, from the follow strip on a creator's page.
export async function setEmailPosts(formData: FormData) {
  await blockInDemo();
  const user = await requireUser();
  const on = formData.get("emailPosts") === "on";
  if (on && (!(await mailIsConfigured()) || !user.emailVerifiedAt)) {
    redirect(`${safeReturn(formData)}?error=${encodeURIComponent("Confirm your email address first to get new posts by email.")}`);
  }
  await prisma.user.update({ where: { id: user.id }, data: { emailPosts: on } });
  redirect(`${safeReturn(formData)}?notice=${encodeURIComponent(on ? "You'll get new posts by email." : "You won't get new posts by email any more.")}`);
}

// Only places on this site are valid places to come back to.
function safeReturn(formData: FormData): string {
  const value = String(formData.get("returnTo") ?? "");
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("?") && !value.includes("\\") ? value : "/";
}
