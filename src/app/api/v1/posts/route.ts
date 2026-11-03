import { ApiError, page, pagination, route } from "@/lib/api";
import { postInclude, serializePost } from "@/lib/api-posts";
import { notifyNewPost } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const GET = route(async (request, user) => {
  const { take, cursor } = pagination(request);
  const rows = await prisma.post.findMany({
    where: { creatorId: user.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: postInclude,
  });
  const result = page(rows, take);
  return { body: { data: result.data.map((post) => serializePost(post, user)), nextCursor: result.nextCursor } };
});

// Text posts only; photos and videos are uploaded from the dashboard.
export const POST = route(async (request, user) => {
  const input = (await request.json().catch(() => null)) as { title?: unknown; text?: unknown; visibility?: unknown } | null;
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const text = typeof input?.text === "string" ? input.text.trim() : "";
  const visibility = typeof input?.visibility === "string" ? input.visibility : "";
  if (!title || title.length > 150) throw new ApiError(400, "invalid_title", "title is required (up to 150 characters).");
  if (text.length > 20_000) throw new ApiError(400, "invalid_text", "text is too long.");

  let minTierId: string | null = null;
  if (visibility !== "public") {
    const tier = await prisma.tier.findFirst({ where: { id: visibility, creatorId: user.id }, select: { id: true } });
    if (!tier) throw new ApiError(400, "invalid_visibility", 'visibility must be "public" or a tier id.');
    minTierId = tier.id;
  }

  const post = await prisma.post.create({
    data: { creatorId: user.id, title, textContent: text, isPublic: visibility === "public", minTierId },
    include: postInclude,
  });
  await notifyNewPost(post.id);
  return { body: { data: serializePost(post, user) }, status: 201 };
});
