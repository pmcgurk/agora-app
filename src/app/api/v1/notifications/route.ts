import { page, pagination, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/webhooks";

export const GET = route(async (request, user) => {
  const { take, cursor } = pagination(request);
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const result = page(rows, take);
  return {
    body: {
      data: result.data.map((row) => ({
        id: row.id,
        type: row.type,
        message: row.message,
        url: absoluteUrl(row.href),
        read: row.readAt !== null,
        createdAt: row.createdAt,
      })),
      nextCursor: result.nextCursor,
    },
  };
});
