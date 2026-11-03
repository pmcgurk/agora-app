import { headers } from "next/headers";

type Bucket = { count: number; resetAt: number };

// In-memory, per-process limiter: enough to stop password guessing against a single-instance deployment.
const store = (globalThis as { __agoraLimits?: Map<string, Bucket> }).__agoraLimits ?? new Map<string, Bucket>();
(globalThis as { __agoraLimits?: Map<string, Bucket> }).__agoraLimits = store;

// Returns true while the caller is within `limit` hits per `windowMs`.
export function withinLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (store.size > 5000) {
    for (const [k, bucket] of store) if (bucket.resetAt <= now) store.delete(k);
  }
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

// A reverse proxy appends the address it received the request from, so the RIGHTMOST
// X-Forwarded-For entry is the one it vouches for. The leftmost entries are whatever the client
// sent, so trusting them would let anyone bypass the limits by rotating a header value.
// Caveat: with no proxy in front, these headers are fully client-controlled, so the limits can be
// bypassed. Public instances must sit behind a reverse proxy that sets X-Forwarded-For.
export async function clientIp(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  return forwarded.at(-1) || list.get("x-real-ip")?.trim() || "unknown";
}
