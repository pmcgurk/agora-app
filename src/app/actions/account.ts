"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { blockInDemo } from "@/lib/demo-guard";
import { mailIsConfigured, sendPasswordResetEmail, sendVerificationEmail } from "@/lib/account-email";
import { consumeEmailToken, findEmailToken } from "@/lib/email-tokens";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { clientIp, withinLimit } from "@/lib/rate-limit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 10;
const HOUR = 60 * 60 * 1000;

const go = (path: string, kind: "notice" | "error", message: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message)}`);

// Asks for a password reset link. The answer is always the same, whether or not the address has an
// account, so this form cannot be used to find out who is registered.
export async function requestPasswordReset(formData: FormData) {
  await blockInDemo();
  if (!(await mailIsConfigured())) redirect("/forgot-password");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) go("/forgot-password", "error", "Enter a valid email address.");
  if (!withinLimit(`reset-ip:${await clientIp()}`, 10, HOUR)) go("/forgot-password", "error", "Too many requests. Try again later.");

  // A per-address limit stops anyone using a victim's inbox as a target. Going over it looks the same as success.
  if (withinLimit(`reset:${email}`, 3, HOUR)) {
    // Sent after the response, so how long this takes does not reveal whether the account exists.
    after(async () => {
      try {
        const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
        if (user) await sendPasswordResetEmail(user);
      } catch (error) {
        console.error("Sending the password reset email failed:", error instanceof Error ? error.message : error);
      }
    });
  }
  redirect("/forgot-password?sent=1");
}

// Sets a new password from a reset link. The link works once; every device is signed out afterwards.
export async function resetPassword(formData: FormData) {
  await blockInDemo();
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const page = `/reset-password/${encodeURIComponent(token)}`;
  const expired = "That link has expired or was already used. Ask for a new one.";

  if (!withinLimit(`reset-use:${await clientIp()}`, 20, HOUR)) go(page, "error", "Too many attempts. Try again later.");
  // Check the link before the passwords, so a typo in the form does not use the link up.
  if (!(await findEmailToken(token, "PASSWORD_RESET"))) go("/forgot-password", "error", expired);
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) go(page, "error", `Password must be ${MIN_PASSWORD_LENGTH}-200 characters.`);
  if (password !== confirm) go(page, "error", "The two passwords do not match.");

  const userId = await consumeEmailToken(token, "PASSWORD_RESET");
  if (!userId) return go("/forgot-password", "error", expired);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      // Opening a link sent to the address proves it is theirs.
      data: { passwordHash: await hashPassword(password), ...(user?.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }) },
    }),
    prisma.session.deleteMany({ where: { userId } }),
    // Anything else still waiting to reset this password is void now.
    prisma.emailToken.deleteMany({ where: { userId, kind: "PASSWORD_RESET" } }),
  ]);
  go("/login", "notice", "Password changed. Log in with your new password.");
}

// Confirms an address from the link in the email.
export async function confirmEmail(formData: FormData) {
  await blockInDemo();
  const token = String(formData.get("token") ?? "");
  if (!withinLimit(`verify-use:${await clientIp()}`, 30, HOUR)) go("/verify-email", "error", "Too many attempts. Try again later.");
  const userId = await consumeEmailToken(token, "VERIFY_EMAIL");
  if (!userId) return go("/verify-email", "error", "That link has expired or was already used. Send yourself a new one.");
  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  go("/", "notice", "Email confirmed. Thanks!");
}

// Sends a new confirmation link to the signed-in user.
export async function resendVerification() {
  await blockInDemo();
  const user = await requireUser();
  if (user.emailVerifiedAt) go("/verify-email", "notice", "Your email is already confirmed.");
  if (!(await mailIsConfigured())) go("/verify-email", "error", "This site cannot send email right now.");
  if (!withinLimit(`verify-send:${user.id}`, 3, HOUR)) go("/verify-email", "error", "Too many emails. Try again in a while.");
  const sent = await sendVerificationEmail(user).then(
    () => true,
    () => false,
  );
  if (!sent) go("/verify-email", "error", "The email could not be sent. Try again later.");
  go("/verify-email", "notice", `We sent a new link to ${user.email}.`);
}
