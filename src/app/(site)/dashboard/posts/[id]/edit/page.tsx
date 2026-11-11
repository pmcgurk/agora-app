import { notFound } from "next/navigation";
import PostComposer from "@/components/PostComposer";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { postState } from "@/lib/publishing";

export const dynamic = "force-dynamic";

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("CREATOR");
  const { id } = await params;
  const [post, tiers] = await Promise.all([
    prisma.post.findFirst({
      where: { id, creatorId: user.id },
      include: { media: { orderBy: { position: "asc" }, select: { id: true, kind: true, fileName: true, inline: true } } },
    }),
    prisma.tier.findMany({ where: { creatorId: user.id }, orderBy: { price: "asc" }, select: { id: true, name: true, price: true } }),
  ]);
  if (!post) notFound();

  return (
    <>
      <h1 className="text-3xl font-bold text-primary">Edit post</h1>
      <PostComposer
        tiers={tiers}
        post={{
          id: post.id,
          title: post.title,
          textContent: post.textContent,
          visibility: post.isPublic ? "public" : (post.minTierId ?? "public"),
          previewSeconds: post.previewSeconds,
          allowBlurPreview: post.allowBlurPreview,
          sendEmail: post.sendEmail,
          clearThumbnail: post.clearThumbnail,
          state: postState(post),
          publishedAt: post.publishedAt?.toISOString() ?? null,
          media: post.media,
        }}
      />
    </>
  );
}
