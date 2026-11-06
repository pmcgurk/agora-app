"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { destroyOtherSessions, requireUser } from "@/lib/auth";
import { activeSubscriptionWhere } from "@/lib/access";
import { getStripe } from "@/lib/stripe";
import { normalizeSocialLink, SOCIAL_PLATFORMS } from "@/lib/social-links";
import { isSupportedCurrency } from "@/lib/currency";
import { hashPassword, verifyPassword } from "@/lib/password";
import { paymentMode, STRIPE_KEY_PATTERN, STRIPE_WEBHOOK_SECRET_PATTERN, stripeConfigured } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { SLUG_PATTERN } from "@/lib/profile-fields";
import { setInstancePrivate } from "@/lib/instance";
import { COLOR_PATTERN, parseThemeFile, RADIUS_PATTERN } from "@/themes";
import { isFontKey } from "@/themes/fonts";
import { COLOR_KEYS, isThemeName } from "@/themes/registry";

const MAX_THEME_FILE_BYTES = 20_000;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const pathOf = (section: string) => (section.startsWith("/") ? section : `/settings/${section}`);

// Adds a query parameter, respecting any query already on the path (e.g. "?edit=1").
const withQuery = (path: string, query: string) => `${path}${path.includes("?") ? "&" : "?"}${query}`;

function fail(section: string, message: string): never {
  redirect(withQuery(pathOf(section), `error=${encodeURIComponent(message)}`));
}

function done(section: string, message = "Saved."): never {
  redirect(withQuery(pathOf(section), `notice=${encodeURIComponent(message)}`));
}

// Returned to the form rather than redirecting, so nothing the creator typed is lost on an error.
export type ProfileFormState = { error?: string; notice?: string };

export async function saveProfile(_previous: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const user = await requireUser();
  const name = text(formData, "name");
  if (!name || name.length > 100) return { error: "Enter a name up to 100 characters." };

  if (user.role !== "CREATOR") {
    await prisma.user.update({ where: { id: user.id }, data: { name } });
    return { notice: "Profile saved." };
  }

  const slug = text(formData, "slug").toLowerCase();
  const tagline = text(formData, "tagline");
  const bio = text(formData, "bio");

  if (slug) {
    if (!SLUG_PATTERN.test(slug)) {
      return { error: "The page name must be 3-30 characters: lowercase letters, numbers and hyphens." };
    }
    const taken = await prisma.user.findFirst({
      where: { id: { not: user.id }, OR: [{ slug }, { id: slug }] },
      select: { id: true },
    });
    if (taken) return { error: "That page name is already taken." };
  }
  if (tagline.length > 120) return { error: "The tagline can be up to 120 characters." };
  if (bio.length > 2000) return { error: "The about text can be up to 2000 characters." };

  const socialLinks: Record<string, string> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const raw = text(formData, `social-${platform.key}`);
    if (!raw) continue;
    const url = normalizeSocialLink(platform, raw);
    if (!url) return { error: `Enter a valid ${platform.label} link or username.` };
    socialLinks[platform.key] = url;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name,
      slug: slug || null,
      tagline: tagline || null,
      bio: bio || null,
      socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : Prisma.DbNull,
    },
  });
  return { notice: "Profile saved." };
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

// Colour pickers on the Appearance page. Keeps any uploaded CSS or fonts, and replaces only the colours and radius.
export async function saveCustomColours(formData: FormData) {
  const user = await requireUser("CREATOR");
  const colours: Record<string, string> = {};
  for (const key of COLOR_KEYS) {
    const value = text(formData, key);
    if (!COLOR_PATTERN.test(value)) fail("appearance", `"${key}" must be a colour.`);
    colours[key] = value;
  }
  const radius = text(formData, "radius");
  if (!RADIUS_PATTERN.test(radius)) fail("appearance", "Choose a corner roundness from the list.");

  const existing =
    user.themeSettings && typeof user.themeSettings === "object" && !Array.isArray(user.themeSettings)
      ? (user.themeSettings as Record<string, unknown>)
      : {};
  const next = { ...existing, ...colours, radius, name: "Custom colours" };
  await prisma.user.update({ where: { id: user.id }, data: { themeSettings: next } });
  done("appearance", "Colours saved.");
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
  if (enable && (await paymentMode()) === "off") {
    fail("monetization", "Payments are not configured on this instance. Add your Stripe API key first.");
  }
  if (!enable && (await prisma.tier.count({ where: { creatorId: user.id,   price: { gt: 0 }, active: true } })) > 0) {
      fail("monetization", "Payments can't be turned off while you have active paid tiers. Turn them off or delete them first.");
  }
  await prisma.user.update({ where: { id: user.id }, data: { acceptsPayments: enable } });
  done("monetization", enable ? "Paid tiers enabled." : "Paid tiers disabled.");
}

const MAX_TIER_DESCRIPTION = 400;

export async function saveTips(formData: FormData) {
  const user = await requireUser("CREATOR");
  const enable = formData.get("tipsEnabled") === "on";
  if (enable && (await paymentMode()) === "off") {
    fail("monetization", "Payments are not configured on this instance. Add your Stripe API key first.");
  }
  const tipThanks = text(formData, "tipThanks");
  if (tipThanks.length > MAX_THANKS_LENGTH) fail("monetization", `Thank-you messages are limited to ${MAX_THANKS_LENGTH} characters.`);
  await prisma.user.update({ where: { id: user.id }, data: { tipsEnabled: enable, tipThanks: tipThanks || null } });
  done("monetization", enable ? "Tips enabled." : "Tips disabled.");
}

// Stripe credentials are instance-wide (one Stripe account takes every creator's payments), like the privacy switch.
export async function saveStripeKeys(formData: FormData) {
  await requireUser("CREATOR");
  const secretKey = text(formData, "stripeSecretKey");
  const webhookSecret = text(formData, "stripeWebhookSecret");
  const current = await prisma.instanceSetting.findUnique({ where: { id: "instance" } });

  if (!secretKey && !current?.stripeSecretKey) fail("monetization", "Paste your Stripe secret key (starts with sk_ or rk_).");
  if (secretKey && !STRIPE_KEY_PATTERN.test(secretKey)) {
    fail("monetization", "That doesn't look like a Stripe secret key. It should start with sk_test_, sk_live_, rk_test_ or rk_live_.");
  }
  if (webhookSecret && !STRIPE_WEBHOOK_SECRET_PATTERN.test(webhookSecret)) {
    fail("monetization", "The webhook signing secret should start with whsec_.");
  }

  // Blank fields keep the saved value, so the stored secrets never need to be shown again.
  const data = {
    ...(secretKey ? { stripeSecretKey: secretKey } : {}),
    ...(webhookSecret ? { stripeWebhookSecret: webhookSecret } : {}),
  };
  await prisma.instanceSetting.upsert({
    where: { id: "instance" },
    update: data,
    create: { id: "instance", ...data },
  });
  done("monetization", "Stripe settings saved.");
}

export async function removeStripeKeys() {
  const user = await requireUser("CREATOR");
  if ((await prisma.tier.count({ where: { creatorId: user.id, price: { gt: 0 }, active: true } })) > 0) {
    fail("monetization", "Turn off or delete your paid tiers before removing the Stripe keys.");
  }
  await prisma.instanceSetting.updateMany({ where: { id: "instance" }, data: { stripeSecretKey: null, stripeWebhookSecret: null } });
  done("monetization", "Stripe keys removed.");
}

function parsePrice(formData: FormData): number | null {
  const cents = Math.round(Number(text(formData, "price")) * 100);
  return Number.isFinite(cents) && cents >= 100 && cents <= 100_000 ? cents : null;
}

const MAX_PERKS = 12;
const MAX_PERK_LENGTH = 120;
const MAX_BADGE_LENGTH = 24;

// Where a tier form sends the creator back to: the dashboard, or the support page they edited from.
function returnPath(formData: FormData): string {
  const value = text(formData, "returnTo");
  const allowed = value === "/dashboard/tiers" || /^(\/support|\/creators\/[A-Za-z0-9_-]+\/support)(\?edit=1)?$/.test(value);
  return allowed ? value : "/dashboard/tiers";
}

const MAX_THANKS_LENGTH = 500;

// Perks arrive as one "perk" field per row; blank rows are dropped.
function presentationFields(formData: FormData, path: string) {
  const perks = formData
    .getAll("perk")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  if (perks.length > MAX_PERKS) fail(path, `Up to ${MAX_PERKS} perks per tier.`);
  if (perks.some((perk) => perk.length > MAX_PERK_LENGTH)) fail(path, `Each perk can be up to ${MAX_PERK_LENGTH} characters.`);
  const badge = text(formData, "badge");
  if (badge.length > MAX_BADGE_LENGTH) fail(path, `Badges are limited to ${MAX_BADGE_LENGTH} characters.`);
  const welcomeMessage = text(formData, "welcomeMessage");
  if (welcomeMessage.length > MAX_THANKS_LENGTH) fail(path, `Thank-you messages are limited to ${MAX_THANKS_LENGTH} characters.`);
  return { perks, badge: badge || null, highlighted: formData.get("highlighted") === "on", welcomeMessage: welcomeMessage || null };
}

export async function createTier(formData: FormData) {
  const user = await requireUser("CREATOR");
  const path = returnPath(formData);
  if (!user.acceptsPayments || (await paymentMode()) === "off") {
    fail(path, "Turn on payments in Settings > Payments to add paid tiers.");
  }
  const name = text(formData, "name");
  const price = parsePrice(formData);
  if (!name || name.length > 60) fail(path, "Enter a tier name up to 60 characters.");
  // Free access is the automatic "Follower" tier, so paid tiers start at 1.00.
  if (price === null) fail(path, "Price must be between 1 and 1000 per month.");
  const description = text(formData, "description");
  if (description.length > MAX_TIER_DESCRIPTION) fail(path, `Descriptions are limited to ${MAX_TIER_DESCRIPTION} characters.`);
  const presentation = presentationFields(formData, path);
  await prisma.tier.create({
    data: { creatorId: user.id, name, price, description: description || null, ...presentation },
  });
  done(path, "Tier added.");
}

export async function updateTier(formData: FormData) {
  const user = await requireUser("CREATOR");
  const path = returnPath(formData);
  const tier = await prisma.tier.findFirst({ where: { id: text(formData, "tierId"), creatorId: user.id } });
  if (!tier) fail(path, "That tier no longer exists.");
  const name = text(formData, "name");
  if (!name || name.length > 60) fail(path, "Enter a tier name up to 60 characters.");

  let price = tier.price;
  if (tier.price > 0) {
    const parsed = parsePrice(formData);
    if (parsed === null) fail(path, "Price must be between 1 and 1000 per month.");
    price = parsed;
  }
  const description = text(formData, "description");
  if (description.length > MAX_TIER_DESCRIPTION) fail(path, `Descriptions are limited to ${MAX_TIER_DESCRIPTION} characters.`);
  const presentation = presentationFields(formData, path);
  await prisma.tier.update({
    where: { id: tier.id },
    data: { name, price, description: description || null, ...presentation },
  });
  done(path, "Tier updated.");
}

export async function setTierActive(formData: FormData) {
  const user = await requireUser("CREATOR");
  const tier = await prisma.tier.findFirst({ where: { id: text(formData, "tierId"), creatorId: user.id } });
  if (!tier) fail("/dashboard/tiers", "That tier no longer exists.");
  if (tier.price === 0) fail("/dashboard/tiers", "The free Follower tier can't be turned off.");
  const active = formData.get("active") === "1";
  if (active && (!user.acceptsPayments || (await paymentMode()) === "off")) {
    fail("/dashboard/tiers", "Turn on payments in Settings > Payments before turning a paid tier back on.");
  }
  await prisma.tier.update({ where: { id: tier.id }, data: { active } });
  done("/dashboard/tiers", active ? "Tier turned on." : "Tier turned off. Current members keep access.");
}

export async function deleteTier(formData: FormData) {
  const user = await requireUser("CREATOR");
  const tier = await prisma.tier.findFirst({ where: { id: text(formData, "tierId"), creatorId: user.id } });
  if (!tier) fail("/dashboard/tiers", "That tier no longer exists.");
  if (tier.price === 0) fail("/dashboard/tiers", "The free Follower tier can't be deleted.");

  const [members, posts] = await Promise.all([
    prisma.subscription.count({ where: { tierId: tier.id, ...activeSubscriptionWhere() } }),
    prisma.post.count({ where: { minTierId: tier.id } }),
  ]);
  if (members > 0) fail("/dashboard/tiers", "This tier still has members. Turn it off instead, or end their plans first.");
  if (posts > 0) fail("/dashboard/tiers", "Posts are still limited to this tier. Change their visibility first, or turn the tier off instead.");

  await prisma.tier.delete({ where: { id: tier.id } });
  if (tier.stripePriceId && (await stripeConfigured())) {
    await (await getStripe()).prices.update(tier.stripePriceId, { active: false }).catch(() => undefined);
  }
  done("/dashboard/tiers", "Tier deleted.");
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
