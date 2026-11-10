import { createHash, timingSafeEqual } from "node:crypto";

// Whoever opens /setup first becomes the owner of the site. On a server that is already public that is
// a race anyone could win, so the operator can set SETUP_TOKEN: then setup also asks for that secret,
// which only someone with access to the server's environment can know.

export const setupToken = (): string | null => process.env.SETUP_TOKEN?.trim() || null;

export const setupTokenRequired = (): boolean => setupToken() !== null;

// True when no token is required, or the one typed matches. Compares digests, so the time it takes
// does not depend on how much of the guess is right.
export function setupTokenMatches(typed: string): boolean {
  const expected = setupToken();
  if (expected === null) return true;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(typed.trim()), digest(expected));
}

// A site reachable over https with no token is open to whoever finds it first: worth a warning.
export function setupLooksPublicAndOpen(): boolean {
  return !setupTokenRequired() && (process.env.NEXT_PUBLIC_BASE_URL ?? "").startsWith("https://");
}
