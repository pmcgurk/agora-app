import { creatorPath } from "@/lib/creator";
import { absoluteUrl } from "@/lib/webhooks";

type ApiPost = {
  id: string;
  title: string;
  textContent: string;
  createdAt: Date;
  editedAt: Date | null;
  isPublic: boolean;
  minTier: { id: string; name: string } | null;
  _count: { likes: number; comments: number; media: number };
};

// Media is intentionally not linked: files are only served through the access-checked media route.
export function serializePost(post: ApiPost, creator: { id: string; slug: string | null }) {
  return {
    id: post.id,
    title: post.title,
    text: post.textContent,
    createdAt: post.createdAt,
    editedAt: post.editedAt,
    visibility: post.isPublic ? "public" : post.minTier ? "tier" : "private",
    tier: post.minTier,
    url: absoluteUrl(`${creatorPath(creator)}/posts/${post.id}`),
    likes: post._count.likes,
    comments: post._count.comments,
    mediaFiles: post._count.media,
  };
}

export const postInclude = {
  minTier: { select: { id: true, name: true } },
  _count: { select: { likes: true, comments: true, media: { where: { inline: false } } } },
} as const;
