import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { versionLabel } from "@/lib/version";

export const dynamic = "force-dynamic";

// For load balancers and hosts (Render, Docker, uptime monitors): 200 when the app can reach its
// database, 503 when it cannot. It also says which version is running, for debugging.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", version: versionLabel() });
  } catch {
    return NextResponse.json({ status: "unavailable", version: versionLabel() }, { status: 503 });
  }
}
