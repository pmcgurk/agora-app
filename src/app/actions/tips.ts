"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isBlocked } from "@/lib/blocks";
import { creatorPath, supportPath } from "@/lib/creator";
import { formatMoney } from "@/lib/currency";
import { requireInstanceAccess } from "@/lib/instance";
import { paymentMode } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { clientIp, withinLimit } from "@/lib/rate-limit";
import { createTipCheckoutUrl } from "@/lib/stripe";
import { MAX_TIP, MAX_TIP_MESSAGE, MAX_TIPPER_NAME, MIN_TIP, parseTipAmount, recordTip } from "@/lib/tips";

function tipFail(returnPath: string, message: string): never {
  redirect(`${returnPath}?error=${encodeURIComponent(message)}#tip`);
}

// A one-off tip from a logged-in patron or a guest. Stripe takes the payment through a hosted
// checkout; test mode records it directly.
export async function sendTip(formData: FormData) {
  await requireInstanceAccess();
  const creator = await prisma.user.findFirst({
    where: { id: String(formData.get("creatorId") ?? ""), role: "CREATOR" },
    select: { id: true, name: true, slug: true, currency: true, tipsEnabled: true },
  });
  if (!creator) redirect("/");
  const base = creatorPath(creator);

  // Only the places that show the tip form are valid places to come back to.
  const requested = String(formData.get("returnTo") ?? "");
  const supportBase = await supportPath(creator);
  const returnPath = requested === "/" || requested === base || requested === supportBase ? requested : supportBase;

  const viewer = await getCurrentUser();
  const mode = await paymentMode();
  if (!creator.tipsEnabled || mode === "off") tipFail(returnPath, "This creator isn't accepting tips.");
  if (viewer?.id === creator.id) tipFail(returnPath, "You can't tip yourself.");
  if (viewer && (await isBlocked(creator.id, viewer.id))) tipFail(returnPath, "You can't tip this creator.");
  // Guests are throttled per address so the form can't be used to spray checkout sessions.
  if (!withinLimit(`tip:${viewer?.id ?? (await clientIp())}`, 10, 10 * 60 * 1000)) {
    tipFail(returnPath, "Too many tips in a short time. Try again in a few minutes.");
  }

  const custom = String(formData.get("customAmount") ?? "").trim();
  const amount = parseTipAmount(custom || String(formData.get("amount") ?? ""));
  if (amount === null) {
    tipFail(returnPath, `Enter a tip between ${formatMoney(MIN_TIP, creator.currency)} and ${formatMoney(MAX_TIP, creator.currency)}.`);
  }
  const message = String(formData.get("message") ?? "").trim() || null;
  if (message && message.length > MAX_TIP_MESSAGE) tipFail(returnPath, `Keep your message under ${MAX_TIP_MESSAGE} characters.`);
  // A blank name means the tip is shown as Anonymous.
  const tipperName = String(formData.get("tipperName") ?? "").trim() || null;
  if (tipperName && tipperName.length > MAX_TIPPER_NAME) tipFail(returnPath, `Keep your name under ${MAX_TIPPER_NAME} characters.`);

  if (mode === "test") {
    await recordTip({ patronId: viewer?.id ?? null, creatorId: creator.id, amount: amount, currency: creator.currency, message, tipperName });
    redirect(`${base}?notice=${encodeURIComponent("Thanks for your tip! (Test mode: no payment was taken.)")}`);
  }

  let url: string;
  try {
    url = await createTipCheckoutUrl(creator, returnPath, { patron: viewer, amount: amount, message, tipperName });
  } catch (error) {
    console.error("Could not start tip checkout", error);
    tipFail(returnPath, "Could not start checkout. Try again in a moment.");
  }
  redirect(url);
}
