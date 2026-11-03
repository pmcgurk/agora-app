import { activeSubscriptionWhere } from "@/lib/access";
import { page, pagination, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = route(async (request, user) => {
  const { take, cursor } = pagination(request);
  const rows = await prisma.subscription.findMany({
    where: { tier: { creatorId: user.id }, ...activeSubscriptionWhere() },
    orderBy: { id: "asc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { patron: { select: { id: true, name: true, email: true } }, tier: { select: { id: true, name: true, price: true } } },
  });
  const result = page(rows, take);
  return {
    body: {
      data: result.data.map((row) => ({
        id: row.id,
        patron: row.patron,
        tier: row.tier,
        gifted: row.gifted,
        expiresAt: row.expiresAt,
        since: row.createdAt,
      })),
      nextCursor: result.nextCursor,
    },
  };
});
