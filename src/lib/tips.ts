import { Prisma } from "@/generated/prisma/client";
import { notifyTip } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

// Minor units. Stripe's own minimum varies by currency but is below this for every supported one.
export const MIN_TIP = 100;
export const MAX_TIP = 100_000;
export const MAX_TIP_MESSAGE = 200;
export const MAX_TIPPER_NAME = 60;
export const TIP_PRESETS = [300, 500, 1000] as const;

// What the creator sees for a tip: the name the tipper chose, or "Anonymous".
export const tipperLabel = (payment: { tipperName: string | null }) => payment.tipperName ?? "Anonymous";

// Accepts "5", "5.5" or "5.50" (a comma works as the decimal separator) and returns minor units.
export function parseTipAmount(raw: string): number | null {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(raw.trim());
  if (!match) return null;
  const amount = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return amount >= MIN_TIP && amount <= MAX_TIP ? amount : null;
}

type TipInput = {
  // Set when the tipper was logged in; kept so blocks and refunds notices still work.
  patronId: string | null;
  creatorId: string;
  amount: number;
  currency: string;
  message: string | null;
  tipperName: string | null;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string | null;
};

// Records a tip once; a repeated Stripe delivery for the same checkout session is ignored.
export async function recordTip(input: TipInput): Promise<boolean> {
  try {
    const payment = await prisma.payment.create({
      data: {
        kind: "TIP",
        patronId: input.patronId,
        creatorId: input.creatorId,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        message: input.message,
        tipperName: input.tipperName,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId,
        stripePaymentIntentId: input.stripePaymentIntentId,
      },
    });
    await notifyTip(payment.id).catch((error) => console.error("Could not notify about tip", error));
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}
