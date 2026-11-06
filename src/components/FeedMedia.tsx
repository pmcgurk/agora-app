"use client";

import { useEffect, useState } from "react";
import LockedMedia from "@/components/LockedMedia";
import FileCard from "@/components/FileCard";

export type FeedItem = {
  id: string;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "FILE";
  fileName?: string | null;
  size?: number | null;
  canBlur: boolean;
  previewSeconds: number | null;
  hasThumbnail: boolean;
};

const arrow =
  "absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-xl text-white hover:bg-black/80";

function Arrows({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  return (
    <>
      <button type="button" aria-label="Previous" onClick={onPrev} className={`${arrow} left-2`}>‹</button>
      <button type="button" aria-label="Next" onClick={onNext} className={`${arrow} right-2`}>›</button>
    </>
  );
}

function Lightbox({ images, start, onClose }: { images: FeedItem[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const step = (delta: number) => setIndex((current) => (current + delta + images.length) % images.length);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div role="dialog" aria-modal="true" aria-label="Image viewer" className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/media/${images[index].id}`} alt="" className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />
      <button type="button" aria-label="Close" onClick={onClose} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-2xl text-white hover:bg-white/30">×</button>
      {images.length > 1 && (
        <div onClick={(event) => event.stopPropagation()}>
          <Arrows onPrev={() => step(-1)} onNext={() => step(1)} />
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
            {index + 1} / {images.length}
          </span>
        </div>
      )}
    </div>
  );
}

// Media for a feed card: playable video and audio, click-to-expand photos, and a gallery for
// posts with several files. Locked posts reuse LockedMedia, so only teaser derivatives load.
export default function FeedMedia({ items, unlocked }: { items: FeedItem[]; unlocked: boolean }) {
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const item = items[index];
  if (!item) return null;
  const images = items.filter((entry) => entry.kind === "IMAGE");
  const step = (delta: number) => setIndex((current) => (current + delta + items.length) % items.length);
  const src = `/api/media/${item.id}`;

  return (
    <div className="mt-3 space-y-2">
      <div className="relative overflow-hidden rounded-theme bg-secondary">
        {!unlocked ? (
          <LockedMedia key={item.id} item={item} canBlur={item.canBlur} previewSeconds={item.previewSeconds} hasThumbnail={item.hasThumbnail} />
        ) : item.kind === "IMAGE" ? (
          <button type="button" aria-label="Expand image" onClick={() => setLightbox(images.indexOf(item))} className="block w-full cursor-zoom-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading="lazy" className="h-auto w-full" />
          </button>
        ) : item.kind === "VIDEO" ? (
          <video key={item.id} src={src} poster={`${src}?variant=thumb`} controls controlsList="nodownload" preload="none" className="aspect-video w-full bg-black" />
        ) : item.kind === "FILE" ? (
          <FileCard key={item.id} id={item.id} fileName={item.fileName ?? null} size={item.size ?? null} />
        ) : (
          <audio key={item.id} src={src} controls preload="none" className="w-full p-3" />
        )}
        {items.length > 1 && (
          <>
            <Arrows onPrev={() => step(-1)} onNext={() => step(1)} />
            <span className="agora-media-count absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                <rect x="7" y="7" width="14" height="14" rx="2" />
                <path d="M3 17V5a2 2 0 0 1 2-2h12" />
              </svg>
              {index + 1} / {items.length}
            </span>
          </>
        )}
      </div>
      {items.length > 1 && (
        <div className="flex justify-center gap-1.5" aria-label="Media in this post">
          {items.map((entry, position) => (
            <button
              key={entry.id}
              type="button"
              aria-label={`Show item ${position + 1}`}
              aria-current={position === index}
              onClick={() => setIndex(position)}
              className={`h-2 w-2 rounded-full ${position === index ? "bg-primary" : "bg-line"}`}
            />
          ))}
        </div>
      )}
      {lightbox !== null && <Lightbox images={images} start={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
