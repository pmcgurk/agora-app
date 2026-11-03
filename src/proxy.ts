import { NextResponse } from "next/server";

function origin(value: string | undefined): string {
  try {
    return value ? new URL(value).origin : "";
  } catch {
    return "";
  }
}

// Security headers for every page. Media comes from the storage endpoint, fonts from Google Fonts,
// and nothing may frame the app. Next.js needs inline scripts and styles for hydration and theming.
export function proxy() {
  const storage = origin(process.env.MINIO_PUBLIC_ENDPOINT);
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${storage}`.trim(),
    `media-src 'self' blob: ${storage}`.trim(),
    `connect-src 'self' ${storage}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
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
