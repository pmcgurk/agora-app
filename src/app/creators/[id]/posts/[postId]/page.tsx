import { notFound } from "next/navigation";
import PostView from "@/components/PostView";
import { getCreator } from "@/lib/creator";
import { postMetadata } from "@/lib/post-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string; postId: string }> }) {
  const { id, postId } = await params;
  const creator = await getCreator(id);
  return creator ? postMetadata(creator, postId) : {};
}

export default async function PostPage({ params }: { params: Promise<{ id: string; postId: string }> }) {
  const { id, postId } = await params;
  const creator = await getCreator(id);
  if (!creator) notFound();
  return <PostView creator={creator} postId={postId} siteRoute={false} />;
}
