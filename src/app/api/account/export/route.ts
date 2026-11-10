import { NextResponse } from "next/server";
import { buildAccountExport } from "@/lib/account-export";
import { getCurrentUser } from "@/lib/auth";
import { clientIp, withinLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Downloads everything held about the signed-in account as a JSON file. Only for the person themselves.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!withinLimit(`export:${user.id}`, 5, 10 * 60 * 1000) || !withinLimit(`export-ip:${await clientIp()}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many downloads. Try again in a few minutes." }, { status: 429 });
  }
  const data = await buildAccountExport(user.id);
  if (!data) return new NextResponse(null, { status: 404 });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="agora-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
