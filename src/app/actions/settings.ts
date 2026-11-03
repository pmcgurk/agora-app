"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { destroyOtherSessions, requireUser } from "@/lib/auth";
import { isSupportedCurrency } from "@/lib/currency";
import { hashPassword, verifyPassword } from "@/lib/password";
import { paymentMode } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { FEDIVERSE_PATTERN, SLUG_PATTERN } from "@/lib/profile-fields";
import { setInstancePrivate } from "@/lib/instance";
import { parseThemeFile } from "@/themes";
import { isFontKey } from "@/themes/fonts";
import { isThemeName } from "@/themes/registry";

const MAX_THEME_FILE_BYTES = 20_000;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const pathOf = (section: string) => (section.startsWith("/") ? section : `/settings/${section}`);

function fail(section: string, message: string): never {
  redirect(`${pathOf(section)}?error=${encodeURIComponent(message)}`);
}

function done(section: string, message = "Saved."): never {
  redirect(`${pathOf(section)}?notice=${encodeURIComponent(message)}`);
}

export async function saveProfile(formData: FormData) {
  const user = await requireUser();
  const name = text(formData, "name");
  if (!name || name.length > 100) fail("profile", "Enter a name up to 100 characters.");

  if (user.role !== "CREATOR") {
    await prisma.user.update({ where: { id: user.id }, data: { name } });
    done("profile");
  }

  const slug = text(formData, "slug").toLowerCase();
  const tagline = text(formData, "tagline");
  const bio = text(formData, "bio");
  const fediverseHandle = text(formData, "fediverseHandle");

  if (slug) {
    if (!SLUG_PATTERN.test(slug)) {
      fail("profile", "The page name must be 3-30 characters: lowercase letters, numbers and hyphens.");
    }
    const taken = await prisma.user.findFirst({
      where: { id: { not: user.id }, OR: [{ slug }, { id: slug }] },
      select: { id: true },
    });
    if (taken) fail("profile", "That page name is already taken.");
  }
  if (tagline.length > 120) fail("profile", "The tagline can be up to 120 characters.");
  if (bio.length > 2000) fail("profile", "The about text can be up to 2000 characters.");
  if (fediverseHandle && !FEDIVERSE_PATTERN.test(fediverseHandle)) {
    fail("profile", "Enter a fediverse handle like @name@example.social.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { name, slug: slug || null, tagline: tagline || null, bio: bio || null, fediverseHandle: fediverseHandle || null },
  });
  done("profile");
}

export async function saveAppearance(formData: FormData) {
  const user = await requireUser("CREATOR");
  const choice = text(formData, "theme");
  const showPoweredBy = formData.get("showPoweredBy") === "on";
  const fontBody = text(formData, "fontBody");
  const fontHeading = text(formData, "fontHeading");
  if ((fontBody && !isFontKey(fontBody)) || (fontHeading && !isFontKey(fontHeading))) fail("appearance", "Choose a listed font.");
  const fonts = { fontBody: fontBody || null, fontHeading: fontHeading || null };

  if (choice === "custom") {
    if (!user.themeSettings) fail("appearance", "Upload a theme file first.");
    await prisma.user.update({ where: { id: user.id }, data: { showPoweredBy, ...fonts } });
  } else {
    if (!isThemeName(choice)) fail("appearance", "Choose a theme.");
    // Picking a built-in theme replaces any uploaded colors.
    await prisma.user.update({
      where: { id: user.id },
      data: { themeName: choice, themeSettings: Prisma.DbNull, showPoweredBy, ...fonts },
    });
  }
  done("appearance");
}

// A theme file is plain JSON colors, never code: {"name": "Ocean", "colors": {"primary": "#0e7490", ...}}
export async function uploadTheme(formData: FormData) {
  const user = await requireUser("CREATOR");
  const file = formData.get("themeFile");
  if (!(file instanceof File) || file.size === 0) fail("appearance", "Choose a theme file.");
  if (file.size > MAX_THEME_FILE_BYTES) fail("appearance", "Theme files must be under 20 KB.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    fail("appearance", "That file is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("appearance", "The theme file must be a JSON object.");
  }

  const result = parseThemeFile(parsed);
  if ("error" in result) fail("appearance", result.error);
  const settings = result.settings;

  await prisma.user.update({ where: { id: user.id }, data: { themeSettings: settings } });
  done("appearance", "Theme uploaded.");
}

export async function removeTheme() {
  const user = await requireUser("CREATOR");
  await prisma.user.update({ where: { id: user.id }, data: { themeSettings: Prisma.DbNull } });
  done("appearance", "Custom theme removed.");
}

export async function saveCurrency(formData: FormData) {
  const user = await requireUser("CREATOR");
  const currency = text(formData, "currency");
  if (!isSupportedCurrency(currency)) fail("monetization", "Choose a supported currency.");
  await prisma.user.update({ where: { id: user.id }, data: { currency } });
  done("monetization", "Currency updated.");
}

export async function savePayments(formData: FormData) {
  const user = await requireUser("CREATOR");
  const enable = formData.get("acceptsPayments") === "on";
  if (enable && paymentMode() === "off") {
    fail("monetization", "Payments are not configured on this instance. Set STRIPE_SECRET_KEY first.");
  }
  if (!enable && (await prisma.tier.count({ where: { creatorId: user.id, price: { gt: 0 } } })) > 0) {
    fail("monetization", "Payments can't be turned off while you have paid tiers.");
  }
  await prisma.user.update({ where: { id: user.id }, data: { acceptsPayments: enable } });
  done("monetization", enable ? "Paid tiers enabled." : "Paid tiers disabled.");
}

const MAX_TIER_DESCRIPTION = 400;

function parsePrice(formData: FormData): number | null {
  const cents = Math.round(Number(text(formData, "price")) * 100);
  return Number.isFinite(cents) && cents >= 100 && cents <= 100_000 ? cents : null;
}

export async function createTier(formData: FormData) {
  const user = await requireUser("CREATOR");
  if (!user.acceptsPayments || paymentMode() === "off") {
    fail("/dashboard/tiers", "Turn on payments in Settings > Monetization to add paid tiers.");
  }
  const name = text(formData, "name");
  const price = parsePrice(formData);
  if (!name || name.length > 60) fail("/dashboard/tiers", "Enter a tier name up to 60 characters.");
  // Free access is the automatic "Follower" tier, so paid tiers start at 1.00.
  if (price === null) fail("/dashboard/tiers", "Price must be between 1 and 1000 per month.");
  const description = text(formData, "description");
  if (description.length > MAX_TIER_DESCRIPTION) fail("/dashboard/tiers", `Descriptions are limited to ${MAX_TIER_DESCRIPTION} characters.`);
  await prisma.tier.create({ data: { creatorId: user.id, name, price, description: description || null } });
  done("/dashboard/tiers", "Tier added.");
}

export async function updateTier(formData: FormData) {
  const user = await requireUser("CREATOR");
  const tier = await prisma.tier.findFirst({ where: { id: text(formData, "tierId"), creatorId: user.id } });
  if (!tier) fail("/dashboard/tiers", "That tier no longer exists.");
  const name = text(formData, "name");
  if (!name || name.length > 60) fail("/dashboard/tiers", "Enter a tier name up to 60 characters.");

  let price = tier.price;
  if (tier.price > 0) {
    const parsed = parsePrice(formData);
    if (parsed === null) fail("/dashboard/tiers", "Price must be between 1 and 1000 per month.");
    price = parsed;
  }
  const description = text(formData, "description");
  if (description.length > MAX_TIER_DESCRIPTION) fail("/dashboard/tiers", `Descriptions are limited to ${MAX_TIER_DESCRIPTION} characters.`);
  await prisma.tier.update({ where: { id: tier.id }, data: { name, price, description: description || null } });
  done("/dashboard/tiers", "Tier updated.");
}

export async function changePassword(formData: FormData) {
  const user = await requireUser();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!(await verifyPassword(current, user.passwordHash))) fail("account", "Your current password is incorrect.");
  if (next.length < 10 || next.length > 200) fail("account", "The new password must be 10-200 characters.");
  if (next !== confirm) fail("account", "The new passwords do not match.");

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await destroyOtherSessions(user.id);
  done("account", "Password changed. Other devices were signed out.");
}

export async function savePrivacy(formData: FormData) {
  const user = await requireUser("CREATOR");
  await setInstancePrivate(formData.get("isPrivate") === "on");
  const tierId = String(formData.get("dmMinTierId") ?? "");
  const tier = tierId ? await prisma.tier.findFirst({ where: { id: tierId, creatorId: user.id }, select: { id: true } }) : null;
  await prisma.user.update({
    where: { id: user.id },
    data: { allowDMs: formData.get("allowDMs") === "on", dmMinTierId: tier?.id ?? null },
  });
  done("privacy");
}

export async function saveNotifications(formData: FormData) {
  const user = await requireUser();
  const on = (name: string) => formData.get(name) === "on";
  if (user.role === "CREATOR") {
    const tiers = await prisma.tier.findMany({ where: { creatorId: user.id }, select: { id: true } });
    const muted = tiers.filter((tier) => formData.get(`tier-${tier.id}`) !== "on");
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { notifyComments: on("comments"), notifyLikes: on("likes") } }),
      prisma.tierMute.deleteMany({ where: { userId: user.id } }),
      prisma.tierMute.createMany({ data: muted.map((tier) => ({ userId: user.id, tierId: tier.id })) }),
    ]);
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { notifyPosts: on("posts"), notifyReplies: on("replies") } });
  }
  done("notifications");
}
