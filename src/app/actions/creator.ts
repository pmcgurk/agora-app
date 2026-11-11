"use server";

import { blockInDemo } from "@/lib/demo-guard";
import { endAllPlans, endOtherPlans, endPlan } from "@/lib/subscriptions";
import { getStripe } from "@/lib/stripe";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { activeSubscriptionWhere } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { isBlocked } from "@/lib/blocks";
import {
  cleanFileName,
  describeUpload,
  MAX_FILES_PER_POST,
  MAX_IMAGE_BYTES,
  MAX_PREVIEW_SECONDS,
  maxUploadBytes,
  uploadKeyPrefix,
  type MediaKindName,
} from "@/lib/media";
import {
  allKeysOf,
  deleteObjects,
  NO_DERIVATIVES,
  syncDerivatives,
  type TeaserSettings,
} from "@/lib/post-media";
import { notifyRefund } from "@/lib/notifications";
import { sendRefundNotices } from "@/lib/payment-emails";
import { announceIfDue, isLive } from "@/lib/publishing";
import { uniquePostSlug } from "@/lib/slugs";
import { formatMoney } from "@/lib/currency";
import { tipperLabel } from "@/lib/tips";
import { emitEvent } from "@/lib/webhooks";
import { prisma } from "@/lib/prisma";
import { headObject } from "@/lib/s3";
import { randomUUID } from "node:crypto";

export type PostFormState = { error?: string };

// id: an existing attachment. key: a new upload. ref: the placeholder the editor put in the text.
type MediaItem =
  | { id: string; inline: boolean }
  | { key: string; name: string | null; ref: string | null; inline: boolean };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

type VerifiedUpload = {
  key: string;
  contentType: string;
  kind: MediaKindName;
  size: number;
  fileName: string | null;
  ref: string | null;
  inline: boolean;
};

// Inline images are referenced from the post text as ![alt](upload:<ref>); once the rows exist the
// placeholder becomes the real media address. Returns null if a placeholder has no matching upload.
const PLACEHOLDER = /\]\(upload:([A-Za-z0-9-]{8,64})\)/g;
function linkInlineImages(textContent: string, ids: Map<string, string>): string | null {
  let missing = false;
  const linked = textContent.replace(PLACEHOLDER, (match, ref: string) => {
    const id = ids.get(ref);
    if (!id) {
      missing = true;
      return match;
    }
    return `](/api/media/${id})`;
  });
  return missing || linked.includes("](upload:") ? null : linked;
}

// Uploads go browser -> MinIO directly; before attaching, confirm each object exists, belongs
// to this creator, is not already attached to a post and is within the limits.
async function verifyUploads(
  creatorId: string,
  uploads: { key: string; name: string | null; ref: string | null; inline: boolean }[],
): Promise<VerifiedUpload[] | string> {
  const keyPattern = new RegExp(`^${uploadKeyPrefix(creatorId)}[0-9a-f-]{36}\\.[a-z0-9]{2,4}$`);
  const verified: VerifiedUpload[] = [];
  for (const { key, name, ref, inline } of uploads) {
    if (!keyPattern.test(key)) return "Invalid upload.";
    if (await prisma.postMedia.findFirst({ where: { objectKey: key }, select: { id: true } })) {
      return "That file is already attached to a post.";
    }
    const head = await headObject(key);
    if (!head) return "An uploaded file is missing. Remove it and upload it again.";
    const described = describeUpload(head.contentType);
    const limit = described.kind === "IMAGE" ? MAX_IMAGE_BYTES : maxUploadBytes();
    if (head.size > limit) {
      await deleteObjects([key]);
      return "A file exceeded the size limit.";
    }
    if (inline && described.kind !== "IMAGE") {
      await deleteObjects([key]);
      return "Only images can go inside the text.";
    }
    verified.push({
      key,
      contentType: described.contentType,
      kind: described.kind,
      size: head.size,
      fileName: described.kind === "FILE" ? (cleanFileName(name) ?? "file") : null,
      ref,
      inline,
    });
  }
  return verified;
}

function parseItems(raw: string): MediaItem[] | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    return "Invalid media list.";
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_FILES_PER_POST) {
    return `Attach up to ${MAX_FILES_PER_POST} files.`;
  }
  const items: MediaItem[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    const value = entry as { id?: unknown; key?: unknown; name?: unknown; ref?: unknown; inline?: unknown };
    const identifier = typeof value?.id === "string" ? value.id : typeof value?.key === "string" ? value.key : null;
    if (!identifier || seen.has(identifier)) return "Invalid media list.";
    seen.add(identifier);
    const inline = value.inline === true;
    if (typeof value.id === "string") {
      items.push({ id: value.id, inline });
      continue;
    }
    const ref = typeof value.ref === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value.ref) ? value.ref : null;
    items.push({ key: value.key as string, name: cleanFileName(value.name), ref, inline });
  }
  return items;
}

// When the post goes live: straight away, never (a draft) or at a chosen moment. The browser sends the
// moment as an ISO time, so the creator's time zone never needs guessing here.
type Schedule = { kind: "now" } | { kind: "draft" } | { kind: "at"; at: Date };
const MAX_SCHEDULE_AHEAD_MS = 2 * 365 * 24 * 60 * 60 * 1000;

function readSchedule(formData: FormData): Schedule | string {
  const when = text(formData, "when");
  if (when === "draft") return { kind: "draft" };
  if (when === "schedule") {
    const at = new Date(text(formData, "publishAt"));
    if (Number.isNaN(at.getTime())) return "Choose a date and time to publish.";
    if (at.getTime() <= Date.now() + 60_000) return "Choose a time at least a minute from now.";
    if (at.getTime() > Date.now() + MAX_SCHEDULE_AHEAD_MS) return "Posts can be scheduled up to two years ahead.";
    return { kind: "at", at };
  }
  return { kind: "now" };
}

async function readPostForm(creatorId: string, formData: FormData) {
  const title = text(formData, "title");
  const textContent = text(formData, "textContent");
  const visibility = text(formData, "visibility");

  if (!title || title.length > 150) return "Enter a title up to 150 characters.";
  if (textContent.length > 20_000) return "Post text is too long.";

  const isPublic = visibility === "public";
  let minTierId: string | null = null;
  if (!isPublic) {
    const tier = await prisma.tier.findFirst({
      where: { id: visibility, creatorId },
      select: { id: true },
    });
    if (!tier) return "Choose who can see this post.";
    minTierId = tier.id;
  }

  const items = parseItems(text(formData, "media"));
  if (typeof items === "string") return items;
  const schedule = readSchedule(formData);
  if (typeof schedule === "string") return schedule;

  // Teasers only make sense on gated posts.
  const requestedSeconds = Math.floor(Number(text(formData, "previewSeconds")));
  return {
    title,
    textContent,
    isPublic,
    minTierId,
    items,
    schedule,
    allowBlurPreview: !isPublic && formData.get("allowBlurPreview") === "on",
    clearThumbnail: !isPublic && formData.get("clearThumbnail") === "on",
    previewSeconds:
      !isPublic && requestedSeconds >= 1 ? Math.min(requestedSeconds, MAX_PREVIEW_SECONDS) : null,
  };
}

export async function createPost(_previous: PostFormState, formData: FormData): Promise<PostFormState> {
  await blockInDemo();
  const user = await requireUser("CREATOR");
  const form = await readPostForm(user.id, formData);
  if (typeof form === "string") return { error: form };
  if (form.items.some((item) => "id" in item)) return { error: "Invalid media list." };

  const uploads = await verifyUploads(
    user.id,
    form.items.flatMap((item) => ("key" in item ? [item] : [])),
  );
  if (typeof uploads === "string") return { error: uploads };

  // Each upload gets its row id now, so the text can point at inline images before anything is written.
  const planned = uploads.map((upload) => ({ upload, id: randomUUID() }));
  const ids = new Map(planned.flatMap(({ upload, id }) => (upload.ref ? [[upload.ref, id] as const] : [])));
  const textContent = linkInlineImages(form.textContent, ids);
  if (textContent === null) return { error: "An image in the text is missing. Remove it from the text or add it again." };

  const teasers: TeaserSettings = {
    allowBlurPreview: form.allowBlurPreview,
    previewSeconds: form.previewSeconds,
    previewChanged: false,
  };
  const created: string[] = [];
  let postId: string;
  try {
    const media = [];
    for (const [position, { upload, id }] of planned.entries()) {
      const { kind } = upload;
      const result = await syncDerivatives(
        user.id,
        { kind, objectKey: upload.key, ...NO_DERIVATIVES },
        teasers,
      );
      created.push(...result.created);
      media.push({
        id,
        position,
        inline: upload.inline,
        kind,
        contentType: upload.contentType,
        fileName: upload.fileName,
        size: BigInt(upload.size),
        objectKey: upload.key,
        ...result.next,
      });
    }

    const post = await prisma.post.create({
      data: {
        creatorId: user.id,
        title: form.title,
        slug: await uniquePostSlug(user.id, form.title),
        textContent,
        isPublic: form.isPublic,
        minTierId: form.minTierId,
        allowBlurPreview: form.allowBlurPreview,
        clearThumbnail: form.clearThumbnail,
        previewSeconds: form.previewSeconds,
        publishedAt: form.schedule.kind === "draft" ? null : form.schedule.kind === "at" ? form.schedule.at : new Date(),
        media: { create: media },
      },
    });
    postId = post.id;
  } catch (error) {
    console.error("Publishing post failed", error);
    await deleteObjects(created);
    return { error: "Could not publish the post. Check that the files are valid and try again." };
  }
  // Only tells subscribers when the post is live; scheduled posts are announced when their time comes.
  await announceIfDue(postId);
  // The dashboard sidebar counts drafts and scheduled posts; make it recount after the redirect.
  revalidatePath("/dashboard", "layout");
  const done = {
    now: "Post published.",
    draft: "Draft saved. You'll find it under Drafts below. Only you can see it until you publish it.",
    at: "Post scheduled. You'll find it under Scheduled below, and it goes live on its own.",
  }[form.schedule.kind];
  redirect(`/dashboard/posts?notice=${encodeURIComponent(done)}`);
}

export async function updatePost(_previous: PostFormState, formData: FormData): Promise<PostFormState> {
  await blockInDemo();
  const user = await requireUser("CREATOR");
  const post = await prisma.post.findFirst({
    where: { id: text(formData, "postId"), creatorId: user.id },
    include: { media: true },
  });
  if (!post) return { error: "That post no longer exists." };

  const form = await readPostForm(user.id, formData);
  if (typeof form === "string") return { error: form };

  const existingById = new Map(post.media.map((item) => [item.id, item]));
  if (form.items.some((item) => "id" in item && !existingById.has(item.id))) {
    return { error: "Invalid media list." };
  }
  const keptIds = new Set(form.items.flatMap((item) => ("id" in item ? [item.id] : [])));
  const removed = post.media.filter((item) => !keptIds.has(item.id));

  const uploads = await verifyUploads(
    user.id,
    form.items.flatMap((item) => ("key" in item ? [item] : [])),
  );
  if (typeof uploads === "string") return { error: uploads };
  const uploadByKey = new Map(uploads.map((upload) => [upload.key, upload]));
  // Row ids for the new uploads, fixed up front so the text can link to them.
  const idByKey = new Map(uploads.map((upload) => [upload.key, randomUUID()]));
  const ids = new Map(uploads.flatMap((upload) => (upload.ref ? [[upload.ref, idByKey.get(upload.key)!] as const] : [])));
  const textContent = linkInlineImages(form.textContent, ids);
  if (textContent === null) return { error: "An image in the text is missing. Remove it from the text or add it again." };

  const teasers: TeaserSettings = {
    allowBlurPreview: form.allowBlurPreview,
    previewSeconds: form.previewSeconds,
    previewChanged: form.previewSeconds !== post.previewSeconds,
  };
  // A live post stays live (and keeps its date) unless the creator moves it back to a draft or reschedules it.
  const wasLive = isLive(post.publishedAt);
  const publishedAt =
    form.schedule.kind === "draft" ? null : form.schedule.kind === "at" ? form.schedule.at : wasLive ? post.publishedAt : new Date();
  const created: string[] = [];
  const obsolete: string[] = removed.flatMap(allKeysOf);
  try {
    const updates = [];
    const additions = [];
    for (const [position, item] of form.items.entries()) {
      if ("id" in item) {
        const current = existingById.get(item.id)!;
        const result = await syncDerivatives(user.id, current, teasers);
        created.push(...result.created);
        obsolete.push(...result.obsolete);
        updates.push(prisma.postMedia.update({ where: { id: item.id }, data: { position, inline: item.inline, ...result.next } }));
      } else {
        const upload = uploadByKey.get(item.key)!;
        const { kind } = upload;
        const result = await syncDerivatives(user.id, { kind, objectKey: upload.key, ...NO_DERIVATIVES }, teasers);
        created.push(...result.created);
        additions.push({
          id: idByKey.get(upload.key)!,
          postId: post.id,
          position,
          inline: upload.inline,
          kind,
          contentType: upload.contentType,
          fileName: upload.fileName,
          size: BigInt(upload.size),
          objectKey: upload.key,
          ...result.next,
        });
      }
    }

    await prisma.$transaction([
      prisma.post.update({
        where: { id: post.id },
        data: {
          title: form.title,
          // Until a post has been shown to anyone its address follows the title; after that it never changes.
          ...(post.announcedAt === null && !isLive(post.publishedAt) ? { slug: await uniquePostSlug(user.id, form.title, post.id) } : {}),
          textContent,
          isPublic: form.isPublic,
          minTierId: form.minTierId,
          allowBlurPreview: form.allowBlurPreview,
          clearThumbnail: form.clearThumbnail,
          previewSeconds: form.previewSeconds,
          publishedAt,
          // Only a post that was already live counts as "edited"; finishing a draft is not an edit.
          ...(wasLive && publishedAt !== null && publishedAt <= new Date() ? { editedAt: new Date() } : {}),
        },
      }),
      prisma.postMedia.deleteMany({ where: { id: { in: removed.map((item) => item.id) } } }),
      ...updates,
      prisma.postMedia.createMany({ data: additions }),
    ]);
  } catch (error) {
    console.error("Updating post failed", error);
    await deleteObjects(created);
    return { error: "Could not save the post. Check that the files are valid and try again." };
  }
  await deleteObjects(obsolete);
  await announceIfDue(post.id);
  revalidatePath("/dashboard", "layout");
  const done = {
    now: wasLive ? "Post saved." : "Post published.",
    draft: "Saved as a draft. You'll find it under Drafts below. Only you can see it.",
    at: "Post scheduled. You'll find it under Scheduled below, and it goes live on its own.",
  }[form.schedule.kind];
  redirect(`/dashboard/posts?notice=${encodeURIComponent(done)}`);
}

export async function deletePost(formData: FormData) {
  await blockInDemo();
  const user = await requireUser("CREATOR");
  const post = await prisma.post.findFirst({
    where: { id: text(formData, "postId"), creatorId: user.id },
    include: { media: true },
  });
  if (!post) redirect("/dashboard/posts");

  await prisma.post.delete({ where: { id: post.id } });
  await deleteObjects(post.media.flatMap(allKeysOf));
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/posts?notice=Post+deleted.");
}

function failGift(message: string): never {
  redirect(`/dashboard/members?error=${encodeURIComponent(message)}`);
}

export async function giftSubscription(formData: FormData) {
  await blockInDemo();
  const user = await requireUser("CREATOR");
  const email = text(formData, "email").toLowerCase();
  const tierId = text(formData, "tierId");
  const months = Math.floor(Number(text(formData, "months")));

  if (!Number.isFinite(months) || months < 0 || months > 60) failGift("Choose a gift duration.");
  const tier = await prisma.tier.findFirst({ where: { id: tierId, creatorId: user.id } });
  if (!tier) failGift("Choose a tier to gift.");
  const patron = await prisma.user.findFirst({
    where: { email, role: "PATRON" },
    select: { id: true },
  });
  if (!patron) failGift("No patron account has that email.");
  if (await isBlocked(user.id, patron.id)) failGift("That patron is blocked. Unblock them first.");

  const existing = await prisma.subscription.findUnique({
    where: { patronId_tierId: { patronId: patron.id, tierId: tier.id } },
  });
  const stillActive =
    existing?.status === "ACTIVE" && (!existing.expiresAt || existing.expiresAt > new Date());
  if (stillActive && !existing.gifted) failGift("That patron is already subscribed to this tier.");

  const higher = await prisma.subscription.findFirst({
    where: {
      patronId: patron.id,
      ...activeSubscriptionWhere(),
      tier: { creatorId: user.id, price: { gt: tier.price } },
    },
    select: { id: true },
  });
  if (higher) failGift("That patron already has a higher tier.");
  // One plan per creator: the gift replaces any lower active plan.
  await endOtherPlans(patron.id, user.id, tier.id);

  // Zero months means the gift never expires.
  const expiresAt = months === 0 ? null : new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000);
  await prisma.subscription.upsert({
    where: { patronId_tierId: { patronId: patron.id, tierId: tier.id } },
    update: { status: "ACTIVE", gifted: true, expiresAt },
    create: { patronId: patron.id, tierId: tier.id, status: "ACTIVE", gifted: true, expiresAt },
  });
  redirect("/dashboard/members?notice=Gift+sent.");
}

export async function revokeSubscription(formData: FormData) {
  await blockInDemo();
  const user = await requireUser("CREATOR");
  const subscription = await prisma.subscription.findFirst({
    where: { id: text(formData, "subscriptionId"), status: "ACTIVE", tier: { creatorId: user.id } },
    select: { id: true },
  });
  if (!subscription) backToMembers("error", "That plan is already over.");
  try {
    await endPlan(subscription.id, { atPeriodEnd: false });
  } catch (error) {
    console.error("Could not end plan", error);
    backToMembers("error", "Could not end that plan. Try again in a moment.");
  }
  backToMembers("notice", "Plan ended.");
}

function backToMembers(kind: "notice" | "error", message: string): never {
  redirect(`/dashboard/members?${kind}=${encodeURIComponent(message)}`);
}

// Blocking removes the person's plan and stops them following, subscribing, commenting, liking or messaging.
export async function blockUser(formData: FormData) {
  await blockInDemo();
  const user = await requireUser("CREATOR");
  const userId = text(formData, "userId");
  const email = text(formData, "email").toLowerCase();
  const target = await prisma.user.findFirst({
    where: userId ? { id: userId } : { email },
    select: { id: true, name: true, role: true },
  });
  if (!target) backToMembers("error", "No account has that email.");
  if (target.id === user.id || target.role === "CREATOR") backToMembers("error", "You can't block a creator account.");

  await prisma.block.upsert({
    where: { creatorId_userId: { creatorId: user.id, userId: target.id } },
    update: {},
    create: { creatorId: user.id, userId: target.id },
  });
  try {
    await endAllPlans(target.id, user.id);
  } catch (error) {
    console.error("Could not end plans of blocked user", error);
    backToMembers("error", `${target.name} is blocked, but a paid plan could not be canceled in Stripe. Cancel it from your Stripe dashboard.`);
  }
  emitEvent(user.id, "member.blocked", { user: { id: target.id, name: target.name } });
  backToMembers("notice", `${target.name} is blocked.`);
}

export async function unblockUser(formData: FormData) {
  await blockInDemo();
  const user = await requireUser("CREATOR");
  await prisma.block.deleteMany({ where: { creatorId: user.id, userId: text(formData, "userId") } });
  backToMembers("notice", "Unblocked.");
}

// Issues the Stripe refund (when the payment came from Stripe), then marks the payment refunded and
// ends the plan it paid for. Test checkout takes no real money, so it only updates the records.
export async function refundPayment(formData: FormData) {
  await blockInDemo();
  const user = await requireUser("CREATOR");
  const payment = await prisma.payment.findFirst({
    where: { id: text(formData, "paymentId"), creatorId: user.id, status: "PAID" },
    include: { patron: { select: { id: true, name: true } }, tier: { select: { name: true } } },
  });
  if (!payment) backToMembers("error", "That payment can't be refunded.");

  const amount = formatMoney(payment.amount, payment.currency);
  if (payment.stripePaymentIntentId) {
    try {
      await (await getStripe()).refunds.create(
        { payment_intent: payment.stripePaymentIntentId },
        { idempotencyKey: `refund-${payment.id}` },
      );
    } catch (error) {
      console.error("Stripe refund failed", error);
      backToMembers("error", "Stripe could not refund that payment. Check your Stripe dashboard.");
    }
  }
  const { patronId, tierId } = payment;
  const who = payment.kind === "TIP" ? tipperLabel(payment) : (payment.patron?.name ?? "the patron");
  // Stripe may tell us about the refund (a webhook) at the same moment. Whoever changes PAID to REFUNDED first is
  // the one that emails the patron, so they get exactly one email.
  const [marked] = await prisma.$transaction([
    prisma.payment.updateMany({ where: { id: payment.id, status: "PAID" }, data: { status: "REFUNDED", refundedAt: new Date() } }),
    ...(patronId && tierId
      ? [
          prisma.subscription.updateMany({
            where: { patronId, tierId, status: "ACTIVE", gifted: false },
            data: { status: "CANCELED", cancelAtPeriodEnd: false },
          }),
        ]
      : []),
  ]);
  if (patronId && tierId) {
    const plan = await prisma.subscription.findUnique({
      where: { patronId_tierId: { patronId, tierId } },
      select: { id: true, stripeSubscriptionId: true },
    });
    if (plan?.stripeSubscriptionId) {
      await endPlan(plan.id, { atPeriodEnd: false }).catch((error) => console.error("Could not cancel Stripe plan", error));
    }
  }
  if (marked.count > 0) await sendRefundNotices([payment.id]);
  if (patronId) await notifyRefund(patronId, `${user.name} refunded your ${amount} payment`);
  emitEvent(user.id, "member.refunded", {
    payment: { id: payment.id, amount: payment.amount, currency: payment.currency },
    member: { id: payment.kind === "TIP" ? null : patronId, name: payment.kind === "TIP" ? payment.tipperName : (payment.patron?.name ?? null) },
    tier: tierId ? { id: tierId, name: payment.tier?.name ?? null } : null,
  });
  backToMembers("notice", `Refunded ${amount} to ${who}.`);
}
