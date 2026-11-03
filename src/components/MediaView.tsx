// Media is always loaded through the authorizing /api/media route, never a stored URL.
export type MediaViewItem = { id: string; kind: "IMAGE" | "VIDEO" | "AUDIO" };

export default function MediaView({ item }: { item: MediaViewItem }) {
  const src = `/api/media/${item.id}`;
  if (item.kind === "VIDEO") {
    return (
      <video
        src={src}
        poster={`${src}?variant=thumb`}
        controls
        controlsList="nodownload"
        preload="metadata"
        className="w-full rounded-theme"
      />
    );
  }
  if (item.kind === "AUDIO") return <audio src={src} controls preload="none" className="w-full" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" className="rounded-theme" />;
}
