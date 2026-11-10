import { NextResponse } from "next/server";
import { getCreator } from "@/lib/creator";
import { isPrivateInstance } from "@/lib/instance";
import { buildFeed, FEED_HEADERS } from "@/lib/rss";

export const dynamic = "force-dynamic";

// The RSS feed of one creator on a site with several. Private sites have no public feed.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const creator = await getCreator(id);
  if (!creator || (await isPrivateInstance())) return new NextResponse(null, { status: 404 });
  return new NextResponse(await buildFeed(creator, `/creators/${encodeURIComponent(id)}/feed.xml`), { headers: FEED_HEADERS });
}
