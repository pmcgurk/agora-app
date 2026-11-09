// Demo mode turns an instance into a public showcase: a fictional creator, a setup wizard that can be
// walked through again and again, and everything that could cost money or hurt other visitors
// switched off. It is off by default and only ever enabled with DEMO_MODE=true.

export const isDemoMode = (): boolean => process.env.DEMO_MODE === "true";

// The fictional accounts the demo signs visitors in as. Their password is never needed.
export const DEMO_CREATOR_EMAIL = "maya@example.com";
export const DEMO_SUPPORTER_EMAIL = "priya@example.com";

export const DEMO_OFF = "That is switched off in the public demo.";

// How often the demo wipes itself and re-seeds, in minutes (default 60, minimum 5).
export function demoResetMinutes(): number {
  const minutes = Number(process.env.DEMO_RESET_MINUTES);
  return Number.isFinite(minutes) && minutes >= 5 ? Math.floor(minutes) : 60;
}

// Where waitlist sign-ups are emailed. Unset means the demo shows no waitlist form.
export function waitlistEmail(): string | null {
  const value = process.env.WAITLIST_EMAIL?.trim();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}
