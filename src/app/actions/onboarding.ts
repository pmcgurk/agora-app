"use server";

import { redirect } from "next/navigation";
import { createSession, requireUser } from "@/lib/auth";
import { isSupportedCurrency } from "@/lib/currency";
import { DEMO_CREATOR_EMAIL, isDemoMode } from "@/lib/demo";
import { hashPassword } from "@/lib/password";
import { paymentMode, STRIPE_KEY_PATTERN, STRIPE_WEBHOOK_SECRET_PATTERN } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { clientIp, withinLimit } from "@/lib/rate-limit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 10;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function failAt(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

// Step 1 of a fresh install: creates the owner's creator account. Only works while no creator exists.
// The public demo replays this step for every visitor: it checks the form like the real thing, then
// signs them in as the fictional creator instead of creating anyone.
export async function setupInstance(formData: FormData) {
  const demo = isDemoMode();
  if (!demo && (await prisma.user.findFirst({ where: { role: "CREATOR" }, select: { id: true } }))) redirect("/login");
  if (!withinLimit(`setup:${await clientIp()}`, demo ? 60 : 10, 60 * 60 * 1000)) failAt("/setup", "Too many attempts. Try again later.");

  const name = text(formData, "name");
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!name || name.length > 100) failAt("/setup", "Enter a name up to 100 characters.");
  if (!EMAIL_PATTERN.test(email) || email.length > 254) failAt("/setup", "Enter a valid email address.");
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) {
    failAt("/setup", `Password must be ${MIN_PASSWORD_LENGTH}-200 characters.`);
  }
  if (demo) {
    const maya = await prisma.user.findUnique({ where: { email: DEMO_CREATOR_EMAIL }, select: { id: true } });
    if (!maya) failAt("/setup", "The demo is resetting. Try again in a few seconds.");
    await createSession(maya.id);
    redirect("/onboarding");
  }
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) failAt("/setup", "That email is already registered.");

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role: "CREATOR",
      emailVerifiedAt: new Date(),
      passwordHash: await hashPassword(password),
      // Every creator gets a free tier so visitors can simply follow them.
      createdTiers: { create: { name: "Follower", price: 0 } },
    },
  });
  // The first creator owns the instance: they decide whether it hosts several creators.
  await prisma.instanceSetting.upsert({
    where: { id: "instance" },
    update: { ownerId: user.id },
    create: { id: "instance", ownerId: user.id },
  });
  await createSession(user.id);
  redirect("/onboarding");
}

async function requireOnboarding() {
  const user = await requireUser("CREATOR");
  // In the demo the wizard can be replayed any time; its steps save nothing.
  if (user.onboardedAt && !isDemoMode()) redirect("/dashboard");
  return user;
}

const DEMO_FINISHED = "That's the end of the wizard. Nothing was saved. This is the demo creator's dashboard.";

export async function skipOnboarding() {
  const user = await requireOnboarding();
  if (isDemoMode()) redirect("/dashboard?notice=" + encodeURIComponent(DEMO_FINISHED));
  await prisma.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
  redirect("/dashboard");
}

// Step 2: public page details. Page names are set per creator (invites set them for new creators).
export async function saveOnboardingProfile(formData: FormData) {
  const user = await requireOnboarding();
  const path = "/onboarding";
  const name = text(formData, "name");
  const tagline = text(formData, "tagline");
  const bio = text(formData, "bio");

  if (!name || name.length > 100) failAt(path, "Enter a name up to 100 characters.");
  if (tagline.length > 120) failAt(path, "The tagline can be up to 120 characters.");
  if (bio.length > 2000) failAt(path, "The about text can be up to 2000 characters.");

  if (!isDemoMode()) {
    await prisma.user.update({
      where: { id: user.id },
      data: { name, tagline: tagline || null, bio: bio || null },
    });
  }

  redirect("/onboarding?step=payments");
}

// Step 3a: connect Stripe from inside the wizard, then come back to the payments step.
export async function saveOnboardingStripe(formData: FormData) {
  await requireOnboarding();
  const path = "/onboarding?step=payments";
  const secretKey = text(formData, "stripeSecretKey");
  const webhookSecret = text(formData, "stripeWebhookSecret");
  if (!STRIPE_KEY_PATTERN.test(secretKey)) {
    failAt(path, "That doesn't look like a Stripe secret key. It should start with sk_test_ or sk_live_ (or rk_ for a restricted key).");
  }
  if (webhookSecret && !STRIPE_WEBHOOK_SECRET_PATTERN.test(webhookSecret)) failAt(path, "The webhook signing secret should start with whsec_.");
  // The demo checks the keys like the real thing but never stores them.
  if (isDemoMode()) redirect(`${path}&notice=${encodeURIComponent("Demo: in a real site that connects Stripe. Nothing was saved.")}`);
  const data = { stripeSecretKey: secretKey, ...(webhookSecret ? { stripeWebhookSecret: webhookSecret } : {}) };
  await prisma.instanceSetting.upsert({ where: { id: "instance" }, update: data, create: { id: "instance", ...data } });
  redirect(`${path}&notice=${encodeURIComponent("Stripe connected.")}`);
}

// Step 3: optional payments. Without them the creator only has the free Follower tier.
export async function finishOnboarding(formData: FormData) {
  const user = await requireOnboarding();
  const path = "/onboarding?step=payments";
  const acceptsPayments = formData.get("acceptsPayments") === "on";
  const currency = text(formData, "currency") || user.currency;
  if (!isSupportedCurrency(currency)) failAt("/onboarding", "Choose a supported currency.");

  if (isDemoMode()) redirect("/dashboard?notice=" + encodeURIComponent(DEMO_FINISHED));

  let tier: { name: string; price: number; description: string | null } | null = null;
  if (acceptsPayments) {
    if ((await paymentMode()) === "off") failAt("/onboarding", "Payments are not configured on this instance, so only followers are available.");
    const tierName = text(formData, "tierName");
    const priceInput = text(formData, "tierPrice");
    const description = text(formData, "tierDescription");
    if (tierName || priceInput) {
      const price = Math.round(Number(priceInput) * 100);
      if (!tierName || tierName.length > 60) failAt(path, "Enter a tier name up to 60 characters.");
      if (!Number.isFinite(price) || price < 100 || price > 100_000) failAt(path, "Price must be between 1 and 1000 per month.");
      if (description.length > 400) failAt(path, "Descriptions are limited to 400 characters.");
      tier = { name: tierName, price, description: description || null };
    }
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { currency, acceptsPayments, onboardedAt: new Date() },
    }),
    ...(tier ? [prisma.tier.create({ data: { creatorId: user.id, ...tier } })] : []),
  ]);
  redirect("/dashboard?notice=" + encodeURIComponent("You're all set. Create your first post!"));
}
