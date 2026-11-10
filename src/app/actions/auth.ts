"use server";

import { blockInDemo } from "@/lib/demo-guard";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { mailIsConfigured, sendAlreadyRegisteredEmail, sendFinishSignupEmail } from "@/lib/account-email";
import { createSession, destroySession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { findPendingSignup, takePendingSignup } from "@/lib/pending-signups";
import { needsSetup } from "@/lib/instance";
import { prisma } from "@/lib/prisma";
import { clientIp, withinLimit } from "@/lib/rate-limit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 10;
// Used to keep login timing similar when the email is unknown.
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// Patrons land on the feed; creators on their dashboard.
const landingPath = (role: string): string => (role === "PATRON" ? "/" : "/dashboard");

const FIFTEEN_MINUTES = 15 * 60 * 1000;

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function signup(formData: FormData) {
  await blockInDemo();
  const name = field(formData, "name");
  const email = field(formData, "email").toLowerCase();

  if (!withinLimit(`signup:${await clientIp()}`, 10, 60 * 60 * 1000)) {
    fail("/signup", "Too many sign-ups from this network. Try again later.");
  }
  if (!name || name.length > 100) fail("/signup", "Enter a name up to 100 characters.");
  if (!EMAIL_PATTERN.test(email) || email.length > 254) fail("/signup", "Enter a valid email address.");
  // The creator account is made by the setup wizard; public sign-ups are always patrons.
  if (await needsSetup()) redirect("/setup");

  // With email set up, signing up only sends the address a link; the account is made when its owner opens it
  // and chooses a password. Whether or not the address already has an account, this answers the same, and the
  // work happens after the answer, so neither the words nor the timing tell a stranger who is registered.
  if (await mailIsConfigured()) {
    if (withinLimit(`signup-mail:${email}`, 3, 60 * 60 * 1000)) {
      after(async () => {
        try {
          const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
          if (existing) await sendAlreadyRegisteredEmail(existing);
          else await sendFinishSignupEmail(email, name, formData.get("emailPosts") === "on");
        } catch (error) {
          console.error("Sending the sign-up email failed:", error instanceof Error ? error.message : error);
        }
      });
    }
    redirect("/signup/check-email");
  }

  // Without email there is no way to check the address or to reply privately, so the account is made now.
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) {
    fail("/signup", `Password must be ${MIN_PASSWORD_LENGTH}-200 characters.`);
  }
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    fail("/signup", "That email is already registered.");
  }
  const user = await prisma.user.create({
    data: { name, email, role: "PATRON", passwordHash: await hashPassword(password), emailVerifiedAt: new Date() },
  });
  await createSession(user.id);
  redirect(landingPath(user.role));
}

// Finishes a sign-up from the link in the email: the owner of the address chooses a password and the account
// is created, confirmed and signed in.
export async function finishSignup(formData: FormData) {
  await blockInDemo();
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const page = `/signup/finish/${encodeURIComponent(token)}`;

  if (!withinLimit(`signup-finish:${await clientIp()}`, 20, 60 * 60 * 1000)) fail(page, "Too many attempts. Try again later.");
  // Check the link before the passwords, so a typo does not use it up.
  if (!(await findPendingSignup(token))) fail("/signup", "That link has expired or was already used. Sign up again to get a new one.");
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) fail(page, `Password must be ${MIN_PASSWORD_LENGTH}-200 characters.`);
  if (password !== confirm) fail(page, "The two passwords do not match.");

  const pending = await takePendingSignup(token);
  if (!pending) fail("/signup", "That link has expired or was already used. Sign up again to get a new one.");
  const passwordHash = await hashPassword(password);
  let userId: string;
  try {
    const user = await prisma.user.create({
      data: { name: pending.name, email: pending.email, role: "PATRON", passwordHash, emailVerifiedAt: new Date(), emailPosts: pending.emailPosts },
    });
    userId = user.id;
  } catch {
    // The address got an account some other way while the link was waiting.
    redirect("/login?notice=" + encodeURIComponent("That address already has an account. Log in, or reset your password."));
  }
  await createSession(userId);
  redirect("/?notice=" + encodeURIComponent("Welcome! Your account is ready."));
}

export async function login(formData: FormData) {
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!withinLimit(`login-ip:${await clientIp()}`, 30, FIFTEEN_MINUTES) || !withinLimit(`login:${email}`, 10, FIFTEEN_MINUTES)) {
    fail("/login", "Too many attempts. Try again in a few minutes.");
  }
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) fail("/login", "Incorrect email or password.");

  await createSession(user.id);
  redirect(landingPath(user.role));
}

export async function logout() {
  await destroySession();
  redirect("/");
}
