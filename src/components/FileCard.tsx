import { formatBytes } from "@/lib/media";

// A downloadable attachment. The link goes through the access-checked media route.
export default function FileCard({ id, fileName, size }: { id: string; fileName: string | null; size: number | null }) {
  return (
    <a
      href={`/api/media/${id}`}
      download={fileName ?? undefined}
      className="agora-file flex items-center gap-3 rounded-theme border border-line bg-surface p-3 hover:border-primary"
    >
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M12 11v6m0 0l-2.5-2.5M12 17l2.5-2.5" />
      </svg>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{fileName ?? "Download file"}</span>
        {size !== null && <span className="block text-xs text-muted">{formatBytes(size)}</span>}
      </span>
      <span className="text-sm underline">Download</span>
    </a>
  );
}
