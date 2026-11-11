"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { blockInDemo } from "@/lib/demo-guard";
import { cleanDisplayName, cleanReplyTo, sendMail } from "@/lib/mail";
import { buildPreview, parseChoice } from "@/lib/newsletter-preview";
import { prisma } from "@/lib/prisma";
import { withinLimit } from "@/lib/rate-limit";

const PAGE = "/settings/post-emails";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function back(kind: "notice" | "error", message: string, extra = ""): never {
  redirect(`${PAGE}?${kind}=${encodeURIComponent(message)}${extra}`);
}

// How a creator's new-post emails look and who they come from. The email they signed up with is never used for
// either: the name is their own choice (their public name by default) and replies go only to an address they type here.
export async function savePostEmailSettings(formData: FormData) {
  await blockInDemo();
  const user = await requireUser("CREATOR");

  const format = text(formData, "newsletterFormat");
  if (format !== "EXCERPT" && format !== "FULL") back("error", "Choose what goes in the email.");

  const nameInput = text(formData, "emailFromName");
  const fromName = cleanDisplayName(nameInput);
  if (nameInput && !fromName) back("error", "That sender name can’t be used. Use letters and numbers.");

  const replyInput = text(formData, "emailReplyTo");
  const replyTo = cleanReplyTo(replyInput);
  if (replyInput && !replyTo) back("error", "Enter one email address for replies, such as you@example.com.");

  await prisma.user.update({ where: { id: user.id }, data: { newsletterFormat: format, emailFromName: fromName, emailReplyTo: replyTo } });
  revalidatePath(PAGE);
  back("notice", "Saved.");
}

// Sends the email being previewed to the creator's own account address, so they can see it in a real inbox.
export async function sendTestEmail(formData: FormData) {
  await blockInDemo();
  const user = await requireUser("CREATOR");
  const choice = parseChoice({
    kind: text(formData, "kind"),
    postId: text(formData, "postId"),
    format: text(formData, "format"),
  });
  const keep = `&kind=${encodeURIComponent(text(formData, "kind"))}&postId=${encodeURIComponent(text(formData, "postId"))}&format=${encodeURIComponent(text(formData, "format"))}`;

  if (!withinLimit(`test-email:${user.id}`, 5, 10 * 60_000)) back("error", "That’s a lot of test emails. Try again in a few minutes.", keep);

  const built = await buildPreview(user, choice, true);
  if ("error" in built) back("error", built.error, keep);
  // The test goes out exactly as a real one would, sender name and reply-to included, so it shows what members see.
  const result = await sendMail({ ...built.message, subject: `[Test] ${built.message.subject}` });
  if (!result.ok) back("error", result.error, keep);
  back("notice", `Test email sent to ${user.email}. Check your inbox (and spam).`, keep);
}
