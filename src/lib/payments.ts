export type PaymentMode = "stripe" | "test" | "off";

const STRIPE_KEY_PATTERN = /^(sk|rk)_(test|live)_[A-Za-z0-9]{8,}$/;

export const stripeConfigured = () => STRIPE_KEY_PATTERN.test(process.env.STRIPE_SECRET_KEY ?? "");

// Stripe wins when a real key is set. Otherwise paid tiers use the no-money test checkout only
// while ALLOW_FREE_SUBSCRIPTIONS=true; with neither, only the free tier can be joined.
export function paymentMode(): PaymentMode {
  if (stripeConfigured()) return "stripe";
  return process.env.ALLOW_FREE_SUBSCRIPTIONS === "true" ? "test" : "off";
}

export const testCheckoutEnabled = () => paymentMode() === "test";
