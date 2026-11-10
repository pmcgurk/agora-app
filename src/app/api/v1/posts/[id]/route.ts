import { ApiError, route } from "@/lib/api";
import { postInclude, serializePost } from "@/lib/api-posts";
import { getSiteCreator } from "@/lib/instance";
import { prisma } from "@/lib/prisma";

export const GET = route<{ id: string }>(async (_request, user, { id }) => {
  const post = await prisma.post.findFirst({ where: { id, creatorId: user.id }, include: postInclude });
  if (!post) throw new ApiError(404, "not_found", "Post not found.");
  return { body: { data: serializePost(post, user, (await getSiteCreator())?.id === user.id) } };
});
