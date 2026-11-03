import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { getStripeConfig } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { handleStripeEvent } from "@/lib/stripe-events";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { secretKey, webhookSecret: secret } = await getStripeConfig();
  const signature = request.headers.get("stripe-signature");
  if (!secret || !secretKey) return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const body = await request.text();
  let event;
  try {
    event = (await getStripe()).webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // Claim the event first so retries and duplicates are ignored; release it if handling fails so Stripe retries.
  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw error;
  }
  try {
    await handleStripeEvent(event);
  } catch (error) {
    console.error(`Stripe event ${event.type} failed`, error);
    await prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => undefined);
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
