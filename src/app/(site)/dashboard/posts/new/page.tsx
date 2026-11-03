import PostComposer from "@/components/PostComposer";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const user = await requireUser("CREATOR");
  const tiers = await prisma.tier.findMany({
    where: { creatorId: user.id },
    orderBy: { price: "asc" },
    select: { id: true, name: true, price: true },
  });
  return (
    <>
      <h1 className="text-3xl font-bold text-primary">New post</h1>
      <PostComposer tiers={tiers} />
    </>
  );
}
