"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isBlocked } from "@/lib/blocks";
import { creatorPath, supportPath } from "@/lib/creator";
import { paymentMode } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { activate, endPlan, hasActivePaidPlan } from "@/lib/subscriptions";
import { createCheckoutUrl, createPortalUrl } from "@/lib/stripe";

export async function subscribe(formData: FormData) {
  const user = await requireUser("PATRON");
  const tier = await prisma.tier.findUnique({ where: { id: String(formData.get("tierId") ?? "") } });
  if (!tier) redirect("/");
  const creator = await prisma.user.findUniqueOrThrow({ where: { id: tier.creatorId }, select: { id: true, slug: true } });
  const base = creatorPath(creator);
  const supportBase = await supportPath(creator);
  if (await isBlocked(creator.id, user.id)) {
    redirect(`${supportBase}?error=${encodeURIComponent("You can't follow or subscribe to this creator.")}`);
  }

  // Following (the free tier) never needs payment.
  if (tier.price === 0) {
    if (await hasActivePaidPlan(user.id, tier.creatorId)) redirect(`${base}?notice=${encodeURIComponent("Following is included in your plan.")}`);
    await activate(user.id, tier);
    redirect(`${base}?notice=${encodeURIComponent(tier.welcomeMessage || "You're now following.")}`);
  }
  const mode = await paymentMode();
  if (!tier.active) {
    redirect(`${supportBase}?error=${encodeURIComponent("That tier is no longer available.")}`);
  }
  if (mode === "off") {
    redirect(`${supportBase}?error=${encodeURIComponent("Payments are not enabled yet.")}`);
  }
  if (mode === "test") redirect(`${base}/checkout/${tier.id}`);

  let url: string;
  try {
    const creatorFull = await prisma.user.findUniqueOrThrow({
      where: { id: tier.creatorId },
      select: { id: true, name: true, slug: true, currency: true },
    });
    url = await createCheckoutUrl(user, tier, creatorFull);
  } catch (error) {
    console.error("Could not start Stripe checkout", error);
    redirect(`${supportBase}?error=${encodeURIComponent("Could not start checkout. Try again in a moment.")}`);
  }
  redirect(url);
}

export async function completeTestCheckout(formData: FormData) {
  const user = await requireUser("PATRON");
  const tier = await prisma.tier.findUnique({ where: { id: String(formData.get("tierId") ?? "") } });
  if (!tier || tier.price === 0 || !tier.active || (await paymentMode()) !== "test") redirect("/");
  const creator = await prisma.user.findUniqueOrThrow({
    where: { id: tier.creatorId },
    select: { id: true, slug: true, currency: true },
  });
  if (await isBlocked(creator.id, user.id)) redirect(await supportPath(creator));

  await activate(user.id, tier);
  await prisma.payment.create({
    data: { patronId: user.id, creatorId: creator.id, tierId: tier.id, amount: tier.price, currency: creator.currency },
  });
  redirect(`${creatorPath(creator)}?notice=${encodeURIComponent(tier.welcomeMessage || `Welcome to ${tier.name}!`)}`);
}

// Ends the patron's plan: paid Stripe plans keep working until the period they paid for is over.
export async function cancelSubscription(formData: FormData) {
  const user = await requireUser("PATRON");
  const subscription = await prisma.subscription.findFirst({
    where: { id: String(formData.get("subscriptionId") ?? ""), patronId: user.id, status: "ACTIVE" },
    select: { id: true },
  });
  const returnTo = String(formData.get("returnTo") ?? "");
  const target = returnTo === "settings" ? "/settings/subscriptions" : returnTo.startsWith("/creators/") ? returnTo.split("?")[0] : "/dashboard";
  if (!subscription) redirect(`${target}?error=${encodeURIComponent("That plan is already over.")}`);

  let message: string;
  try {
    const { endsAt } = await endPlan(subscription.id, { atPeriodEnd: true });
    message = endsAt ? `Your plan ends on ${endsAt.toISOString().slice(0, 10)}.` : "Your plan has ended.";
  } catch (error) {
    console.error("Could not end plan", error);
    redirect(`${target}?error=${encodeURIComponent("Could not end your plan. Try again in a moment.")}`);
  }
  redirect(`${target}?notice=${encodeURIComponent(message)}`);
}

export async function openBillingPortal() {
  const user = await requireUser("PATRON");
  if ((await paymentMode()) !== "stripe") redirect("/settings/subscriptions");
  let url: string;
  try {
    url = await createPortalUrl(user);
  } catch (error) {
    console.error("Could not open billing portal", error);
    redirect(`/settings/subscriptions?error=${encodeURIComponent("Could not open billing. Try again in a moment.")}`);
  }
  redirect(url);
}
