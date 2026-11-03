// Only two-decimal currencies are offered, so tier prices can stay in integer minor units.
export const CURRENCIES = [
  { code: "USD", label: "US dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British pound" },
  { code: "CAD", label: "Canadian dollar" },
  { code: "AUD", label: "Australian dollar" },
  { code: "NZD", label: "New Zealand dollar" },
  { code: "CHF", label: "Swiss franc" },
  { code: "SEK", label: "Swedish krona" },
  { code: "NOK", label: "Norwegian krone" },
  { code: "DKK", label: "Danish krone" },
  { code: "PLN", label: "Polish zloty" },
  { code: "BRL", label: "Brazilian real" },
  { code: "MXN", label: "Mexican peso" },
  { code: "INR", label: "Indian rupee" },
] as const;

export function isSupportedCurrency(code: unknown): code is (typeof CURRENCIES)[number]["code"] {
  return typeof code === "string" && CURRENCIES.some((currency) => currency.code === code);
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);
}

export function formatPrice(cents: number, currency = "USD"): string {
  return cents === 0 ? "Free" : `${formatMoney(cents, currency)}`;
}
