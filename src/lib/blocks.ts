import { prisma } from "@/lib/prisma";

export async function isBlocked(creatorId: string, userId: string): Promise<boolean> {
  const block = await prisma.block.findUnique({
    where: { creatorId_userId: { creatorId, userId } },
    select: { userId: true },
  });
  return block !== null;
}
