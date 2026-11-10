import { notFound } from "next/navigation";
import PostView from "@/components/PostView";
import { getSiteCreator } from "@/lib/instance";
import { postMetadata } from "@/lib/post-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ postId: string }> }) {
  const creator = await getSiteCreator();
  return creator ? postMetadata(creator, (await params).postId) : {};
}

export default async function SitePostPage({ params }: { params: Promise<{ postId: string }> }) {
  const creator = await getSiteCreator();
  if (!creator) notFound();
  return <PostView creator={creator} postId={(await params).postId} siteRoute />;
}
