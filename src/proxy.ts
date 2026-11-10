import { EMBED_ORIGINS } from "@/lib/embeds";
import { NextResponse, type NextRequest } from "next/server";

function origin(value: string | undefined): string {
  try {
    return value ? new URL(value).origin : "";
  } catch {
    return "";
  }
}

// Security headers for every page. Media comes from the storage endpoint, fonts from Google Fonts, and
// nothing may frame the app. Scripts run only if they carry this request's one-time nonce (Next.js adds it to
// its own scripts), so injected markup cannot run script even if it got past the escaping. Styles still allow
// inline rules, which theming and Next.js rely on.
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const demo = process.env.DEMO_MODE === "true";
  const storage = origin(process.env.MINIO_PUBLIC_ENDPOINT);
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${storage}`.trim(),
    `media-src 'self' blob: ${storage}`.trim(),
    `connect-src 'self' ${storage}`.trim(),
    `frame-src ${EMBED_ORIGINS.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  // Next.js reads the nonce from the request's policy and puts it on the scripts it renders.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (demo) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
  if (origin(process.env.NEXT_PUBLIC_BASE_URL).startsWith("https://")) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
