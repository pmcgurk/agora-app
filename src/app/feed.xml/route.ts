import { NextResponse } from "next/server";
import { getSiteCreator, isPrivateInstance } from "@/lib/instance";
import { buildFeed, FEED_HEADERS } from "@/lib/rss";

export const dynamic = "force-dynamic";

// The RSS feed of a single-creator site. Private sites have no public feed.
export async function GET() {
  const creator = await getSiteCreator();
  if (!creator || (await isPrivateInstance())) return new NextResponse(null, { status: 404 });
  return new NextResponse(await buildFeed(creator, "/feed.xml"), { headers: FEED_HEADERS });
}
