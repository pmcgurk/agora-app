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

// Behind a reverse proxy the first X-Forwarded-For entry is the client; otherwise there is no IP to use.
export async function clientIp(): Promise<string> {
  const list = await headers();
  return list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "unknown";
}
