import { NextResponse } from "next/server";
import { unsubscribeByToken } from "@/lib/post-emails";
import { clientIp, withinLimit } from "@/lib/rate-limit";
import { publicUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

// The one-click unsubscribe that mail programs call (RFC 8058) when someone uses their "Unsubscribe" button.
// It has to work from the email alone, so the secret in the address is all it needs.
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!withinLimit(`unsubscribe:${await clientIp()}`, 60, 60 * 60 * 1000)) return new NextResponse(null, { status: 429 });
  const { token } = await params;
  const done = await unsubscribeByToken(token);
  return new NextResponse(null, { status: done ? 200 : 404 });
}

// Opening the address in a browser goes to the page with the button (a link scanner must not unsubscribe anyone).
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(publicUrl(`/unsubscribe/${encodeURIComponent(token)}`), 303);
}
