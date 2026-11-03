import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys";
import type { User } from "@/generated/prisma/client";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const windows = new Map<string, { count: number; resetAt: number }>();

// A simple per-key fixed window; it resets on restart, which is fine for a self-hosted instance.
function checkRate(keyId: string): number | null {
  const now = Date.now();
  const current = windows.get(keyId);
  if (!current || current.resetAt <= now) {
    windows.set(keyId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return null;
  }
  current.count += 1;
  return current.count > RATE_LIMIT ? Math.ceil((current.resetAt - now) / 1000) : null;
}

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

type Handler<P> = (request: Request, user: User, params: P) => Promise<{ body: unknown; status?: number }>;

// Wraps a route with API key auth, rate limiting and consistent JSON errors.
export function route<P = Record<string, never>>(handler: Handler<P>) {
  return async (request: Request, context: { params: Promise<P> }): Promise<Response> => {
    try {
      const auth = await authenticateApiKey(request.headers.get("authorization"));
      if (!auth) throw new ApiError(401, "unauthorized", "Missing or invalid API key.");
      const retryAfter = checkRate(auth.keyId);
      if (retryAfter !== null) {
        return json({ error: { code: "rate_limited", message: "Too many requests." } }, 429, { "Retry-After": String(retryAfter) });
      }
      const result = await handler(request, auth.user, await context.params);
      return json(result.body, result.status ?? 200);
    } catch (error) {
      if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, error.status);
      console.error("API error", error);
      return json({ error: { code: "internal_error", message: "Something went wrong." } }, 500);
    }
  };
}

export function pagination(request: Request): { take: number; cursor: string | null } {
  const params = new URL(request.url).searchParams;
  const limit = Math.floor(Number(params.get("limit") ?? 50));
  return { take: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50, cursor: params.get("cursor") };
}

// Fetch one extra row to know whether another page exists.
export function page<T extends { id: string }>(rows: T[], take: number) {
  const items = rows.slice(0, take);
  return { data: items, nextCursor: rows.length > take ? items[items.length - 1].id : null };
}
