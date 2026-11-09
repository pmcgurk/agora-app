"use server";

import { blockInDemo } from "@/lib/demo-guard";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
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
  const password = String(formData.get("password") ?? "");

  if (!withinLimit(`signup:${await clientIp()}`, 10, 60 * 60 * 1000)) {
    fail("/signup", "Too many sign-ups from this network. Try again later.");
  }
  if (!name || name.length > 100) fail("/signup", "Enter a name up to 100 characters.");
  if (!EMAIL_PATTERN.test(email) || email.length > 254) fail("/signup", "Enter a valid email address.");
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) {
    fail("/signup", `Password must be ${MIN_PASSWORD_LENGTH}-200 characters.`);
  }

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    fail("/signup", "That email is already registered.");
  }

  // The creator account is made by the setup wizard; public sign-ups are always patrons.
  if (await needsSetup()) redirect("/setup");
  const user = await prisma.user.create({
    data: { name, email, role: "PATRON", passwordHash: await hashPassword(password) },
  });
  await createSession(user.id);
  redirect(landingPath(user.role));
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
