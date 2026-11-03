"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleCommentLike, toggleLike } from "@/app/actions/social";

type Props = {
  // Id of the post, or of the comment when `target` is "comment".
  postId: string;
  target?: "post" | "comment";
  initialLiked: boolean;
  initialCount: number;
  // "login": signed-out visitor; callers only render this for viewers who can see the post
  mode: "ok" | "login";
};

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.6 4.5 6.3 4.5c2 0 3.7 1.1 4.7 2.7h2c1-1.6 2.7-2.7 4.7-2.7 3.7 0 5.4 3.9 3.9 7.3C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

const pill = "agora-like inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors";

export default function LikeButton({ postId, target = "post", initialLiked, initialCount, mode }: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  if (mode === "login") {
    return (
      <Link href="/login" aria-label="Log in to like" className={`${pill} border-line text-muted hover:border-primary hover:text-primary`}>
        <Heart filled={false} />
        {count}
      </Link>
    );
  }

  function toggle() {
    const next = !liked;
    setLiked(next);
    setCount((current) => current + (next ? 1 : -1));
    startTransition(async () => {
      const formData = new FormData();
      formData.set(target === "comment" ? "commentId" : "postId", postId);
      const result = await (target === "comment" ? toggleCommentLike : toggleLike)(formData);
      if (result) {
        setLiked(result.liked);
        setCount(result.count);
      } else {
        setLiked(!next);
        setCount((current) => current + (next ? -1 : 1));
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      className={`${pill} ${liked ? "border-primary bg-primary/10 text-primary" : "border-line text-muted hover:border-primary hover:text-primary"}`}
    >
      <Heart filled={liked} />
      {count}
    </button>
  );
}
