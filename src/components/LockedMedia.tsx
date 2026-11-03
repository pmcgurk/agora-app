"use client";

import { useState } from "react";
import type { MediaViewItem } from "@/components/MediaView";

type Props = {
  item: MediaViewItem;
  canBlur: boolean;
  previewSeconds: number | null;
  hasThumbnail: boolean;
};

// Nothing but the thumbnail is requested until the visitor clicks. Derivative files are made on
// the server, so the original photo or video is never sent to someone without access.
export default function LockedMedia({ item, canBlur, previewSeconds, hasThumbnail }: Props) {
  const [revealed, setRevealed] = useState(false);
  const thumb = `/api/media/${item.id}?variant=thumb`;

  if (item.kind === "IMAGE" && canBlur) {
    return revealed ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/media/${item.id}?variant=blur`} alt="Blurred preview" className="w-full rounded-theme" />
    ) : (
      <button type="button" onClick={() => setRevealed(true)} className="w-full rounded-theme bg-secondary p-6 underline">
        Show blurred image
      </button>
    );
  }

  if (item.kind === "VIDEO") {
    if (revealed && previewSeconds) {
      return (
        <video
          src={`/api/media/${item.id}?variant=preview`}
          poster={thumb}
          controls
          controlsList="nodownload"
          autoPlay
          className="w-full rounded-theme"
        />
      );
    }
    return (
      <div className="relative overflow-hidden rounded-theme bg-secondary">
        {hasThumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="Video thumbnail" className="aspect-video w-full object-cover" />
        )}
        <div className={`${hasThumbnail ? "absolute inset-0 bg-black/40 text-white" : "p-6"} flex flex-col items-center justify-center gap-2`}>
          <span>Video locked</span>
          {previewSeconds && (
            <button type="button" onClick={() => setRevealed(true)} className="underline">
              Show {previewSeconds} seconds
            </button>
          )}
        </div>
      </div>
    );
  }

  const label = item.kind === "IMAGE" ? "Photo" : "Audio";
  return <div className="rounded-theme bg-secondary p-6 text-center text-muted">{label} locked</div>;
}
