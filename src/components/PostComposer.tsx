"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { createPost, updatePost, type PostFormState } from "@/app/actions/creator";
import { buttonClass, inputClass } from "@/components/ui";
import MarkdownEditor from "@/components/MarkdownEditor";
import { submitKeepingFields } from "@/lib/form-submit";
import { ACCEPT_ATTRIBUTE, describeUpload, formatBytes as formatSize, MAX_FILES_PER_POST, type MediaKindName } from "@/lib/media";

type Tier = { id: string; name: string; price: number };

export type ExistingPost = {
  id: string;
  title: string;
  textContent: string | null;
  visibility: string;
  previewSeconds: number | null;
  allowBlurPreview: boolean;
  // Whether followers who asked for emails get this post by email when it goes live.
  sendEmail: boolean;
  clearThumbnail: boolean;
  // Where the post is in its life: not yet published, waiting for its time, or live.
  state: "draft" | "scheduled" | "published";
  publishedAt: string | null;
  media: { id: string; kind: MediaKindName; fileName?: string | null; inline: boolean }[];
};

type Item = {
  id: string;
  file?: File;
  existingId?: string;
  // Inline images live in the text, not the gallery; they are listed here so they can be removed.
  inline: boolean;
  name: string;
  size: number | null;
  kind: MediaKindName;
  previewUrl: string | null;
  status: "queued" | "uploading" | "done" | "error";
  progress: number;
  key?: string;
  error?: string;
};

const MAX_PARALLEL_UPLOADS = 3;

type When = "now" | "schedule" | "draft";

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in the viewer's own time zone.
function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The scheduled time if there is one, otherwise tomorrow at nine.
function initialLocalTime(post?: ExistingPost): string {
  if (post?.state === "scheduled" && post.publishedAt) return toLocalInput(new Date(post.publishedAt));
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return toLocalInput(tomorrow);
}

// Step 1: ask the app for a presigned PUT URL. Step 2: send the bytes straight to MinIO.
function uploadFile(
  file: File,
  onProgress: (fraction: number) => void,
  register: (abort: () => void) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: file.type, size: file.size }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { key?: string; url?: string; contentType?: string; error?: string };
        if (!response.ok || !body.key || !body.url) throw new Error(body.error ?? "Could not start the upload.");

        const xhr = new XMLHttpRequest();
        register(() => xhr.abort());
        xhr.open("PUT", body.url);
        xhr.setRequestHeader("Content-Type", body.contentType ?? file.type);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress(event.loaded / event.total);
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300 ? resolve(body.key!) : reject(new Error("Upload was rejected."));
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.onabort = () => reject(new Error("Upload cancelled."));
        xhr.send(file);
      })
      .catch(reject);
  });
}

export default function PostComposer({ tiers, post }: { tiers: Tier[]; post?: ExistingPost }) {
  const [state, formAction, pending] = useActionState<PostFormState, FormData>(post ? updatePost : createPost, {});
  const [items, setItems] = useState<Item[]>(() =>
    (post?.media ?? []).map((media) => ({
      id: media.id,
      existingId: media.id,
      inline: media.inline,
      name: media.fileName ?? `Attached ${media.kind.toLowerCase()}`,
      size: null,
      kind: media.kind,
      previewUrl: media.kind === "IMAGE" ? `/api/media/${media.id}` : null,
      status: "done" as const,
      progress: 1,
    })),
  );
  const [visibility, setVisibility] = useState(post?.visibility ?? "public");
  const [when, setWhen] = useState<When>(post?.state === "draft" ? "draft" : post?.state === "scheduled" ? "schedule" : "now");
  const [localTime, setLocalTime] = useState(() => initialLocalTime(post));
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const aborts = useRef(new Map<string, () => void>());
  const queue = useRef<Item[]>([]);
  const activeUploads = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = useCallback((id: string, patch: Partial<Item>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  // Runs queued uploads a few at a time; called whenever the queue or a slot changes.
  function pump() {
    while (activeUploads.current < MAX_PARALLEL_UPLOADS && queue.current.length > 0) {
      const item = queue.current.shift()!;
      if (!item.file) continue;
      activeUploads.current++;
      update(item.id, { status: "uploading", progress: 0, error: undefined });
      uploadFile(
        item.file,
        (fraction) => update(item.id, { progress: fraction }),
        (abort) => aborts.current.set(item.id, abort),
      )
        .then((key) => update(item.id, { status: "done", progress: 1, key }))
        .catch((error: Error) => update(item.id, { status: "error", error: error.message }))
        .finally(() => {
          aborts.current.delete(item.id);
          activeUploads.current--;
          pump();
        });
    }
  }

  useEffect(() => {
    const abortsInFlight = aborts.current;
    return () => abortsInFlight.forEach((abort) => abort());
  }, []);

  // inline: the files are images for the text; ids are the placeholders the editor already inserted.
  function addFiles(fileList: FileList | File[], options?: { inline?: boolean; ids?: string[] }) {
    const accepted: Item[] = [];
    Array.from(fileList).forEach((file, index) => {
      const kind = describeUpload(file.type).kind;
      if (options?.inline && kind !== "IMAGE") return;
      accepted.push({
        id: options?.ids?.[index] ?? crypto.randomUUID(),
        file,
        inline: options?.inline ?? false,
        name: file.name,
        size: file.size,
        kind,
        previewUrl: kind === "IMAGE" ? URL.createObjectURL(file) : null,
        status: "queued",
        progress: 0,
      });
    });
    const room = MAX_FILES_PER_POST - items.length;
    setNotice(accepted.length > room ? `Only ${MAX_FILES_PER_POST} files fit in one post.` : null);
    const added = accepted.slice(0, room);
    setItems((current) => [...current, ...added]);
    queue.current.push(...added);
    pump();
  }

  function remove(item: Item) {
    queue.current = queue.current.filter((candidate) => candidate.id !== item.id);
    aborts.current.get(item.id)?.();
    if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
  }

  function retry(item: Item) {
    update(item.id, { status: "queued", error: undefined, progress: 0 });
    queue.current.push(item);
    pump();
  }

  function move(index: number, direction: -1 | 1) {
    setItems((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  const gated = visibility !== "public";
  const hasImage = items.some((item) => item.kind === "IMAGE");
  const hasVideo = items.some((item) => item.kind === "VIDEO");
  const busy = items.some((item) => item.status === "queued" || item.status === "uploading");
  const failed = items.some((item) => item.status === "error");
  const isLiveNow = post?.state === "published";
  const publishAt = (() => {
    const date = new Date(localTime);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  })();
  const mediaList = items
    .filter((item) => item.status === "done")
    // ref links an inline image's placeholder in the text to its upload; the server swaps it for the media address.
    .map((item) =>
      item.existingId
        ? { id: item.existingId, inline: item.inline }
        : { key: item.key, name: item.name, ref: item.id, inline: item.inline },
    );

  return (
    <form onSubmit={submitKeepingFields(formAction)} className="space-y-4">
      {post && <input type="hidden" name="postId" value={post.id} />}
      <label className="block">
        Title
        <input name="title" required maxLength={150} defaultValue={post?.title} className={inputClass} />
      </label>
      <MarkdownEditor
        defaultValue={post?.textContent ?? ""}
        images={items.map((item) => ({ id: item.id, previewUrl: item.previewUrl }))}
        onImages={(files, ids) => addFiles(files, { inline: true, ids })}
      />

      <div className="space-y-2">
        <span className="block">Attachments <span className="text-sm text-muted">(shown as a gallery under the text)</span></span>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
          className={`rounded-theme border-2 border-dashed p-6 text-center ${dragging ? "border-primary bg-secondary" : "border-line"}`}
        >
          <p>Drag any files here (photos, video, audio, 3D prints, documents…), or</p>
          <button type="button" className={`${buttonClass} mt-2`} onClick={() => inputRef.current?.click()}>
            Choose files
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTRIBUTE}
            className="hidden"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <p className="mt-2 text-sm text-muted">Up to {MAX_FILES_PER_POST} files</p>
        </div>
        {notice && <p role="status" className="text-sm text-danger">{notice}</p>}

        {items.length > 0 && (
          <ul className="space-y-2" aria-label="Attached files">
            {items.map((item, index) => (
              <li key={item.id} className="flex items-center gap-3 rounded-theme border border-line p-2">
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.previewUrl} alt="" className="h-12 w-12 rounded-theme object-cover" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-theme bg-secondary text-xs">
                    {item.kind === "VIDEO" ? "VIDEO" : item.kind === "AUDIO" ? "AUDIO" : "FILE"}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {item.name}
                    {item.inline && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs">In the text</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {item.size !== null && `${formatSize(item.size)} · `}
                    {item.status === "done" && (item.existingId ? "Already in this post" : "Uploaded")}
                    {item.status === "queued" && "Waiting"}
                    {item.status === "uploading" && `Uploading ${Math.round(item.progress * 100)}%`}
                    {item.status === "error" && <span className="text-danger">{item.error}</span>}
                  </p>
                  {(item.status === "uploading" || item.status === "queued") && (
                    <progress value={item.progress} max={1} className="mt-1 h-1.5 w-full" />
                  )}
                </div>
                <div className="flex gap-1 text-sm">
                  <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                  <button type="button" aria-label="Move down" disabled={index === items.length - 1} onClick={() => move(index, 1)}>↓</button>
                  {item.status === "error" && (
                    <button type="button" className="underline" onClick={() => retry(item)}>Retry</button>
                  )}
                  <button type="button" className="underline" onClick={() => remove(item)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="block">
        Who can see it
        <select
          name="visibility"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value)}
          className={inputClass}
        >
          <option value="public">Everyone</option>
          {tiers.map((tier) => (
            <option key={tier.id} value={tier.id}>
              {tier.price === 0 ? `${tier.name}s (anyone who follows you)` : `${tier.name} and above`}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-start gap-2">
        <input type="checkbox" name="sendEmail" defaultChecked={post?.sendEmail ?? true} className="mt-1" />
        <span>
          Email this post to followers who asked for emails
          <span className="block text-sm text-muted">
            Sent once, when the post goes live.
            {post && (
              <>
                {" "}
                <Link href={`/settings/post-emails?kind=post&postId=${post.id}`} className="underline">
                  See how the email looks
                </Link>
                .
              </>
            )}
          </span>
        </span>
      </label>

      {gated && hasImage && (
        <label className="flex items-start gap-2">
          <input type="checkbox" name="allowBlurPreview" defaultChecked={post?.allowBlurPreview} className="mt-1" />
          <span>
            Allow a blurred preview of photos
          </span>
        </label>
      )}
      {gated && hasVideo && (
        <label className="block">
          Free video preview (seconds)
          <input name="previewSeconds" type="number" min="1" max="120" defaultValue={post?.previewSeconds ?? ""} className={inputClass} />
        </label>
      )}

      {gated && hasVideo && (
        <label className="flex items-start gap-2">
          <input type="checkbox" name="clearThumbnail" defaultChecked={post?.clearThumbnail} className="mt-1" />
          <span>
            Show an unblurred video thumbnail
          </span>
        </label>
      )}

      <fieldset className="space-y-2">
        <legend className="font-medium">When to publish</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")} />
          {isLiveNow ? "Published (keep it live)" : "Publish now"}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="when" value="schedule" checked={when === "schedule"} onChange={() => setWhen("schedule")} />
          Schedule for later
        </label>
        {when === "schedule" && (
          <div className="ml-6 space-y-1">
            <input
              type="datetime-local"
              aria-label="Publish date and time"
              required
              value={localTime}
              onChange={(event) => setLocalTime(event.target.value)}
              suppressHydrationWarning
              className={`${inputClass} max-w-xs`}
            />
            <p className="text-sm text-muted">In your own time zone. It goes live on its own, and followers are told then.</p>
          </div>
        )}
        <label className="flex items-center gap-2">
          <input type="radio" name="when" value="draft" checked={when === "draft"} onChange={() => setWhen("draft")} />
          {isLiveNow ? "Move back to a draft (hides it from everyone)" : "Save as a draft (only you can see it)"}
        </label>
        <input type="hidden" name="publishAt" value={publishAt} />
      </fieldset>

      <input type="hidden" name="media" value={JSON.stringify(mediaList)} />
      {state.error && <p role="alert" className="text-danger">{state.error}</p>}
      <button className={buttonClass} disabled={pending || busy || failed}>
        {pending
          ? "Saving…"
          : busy
            ? "Waiting for uploads…"
            : failed
              ? "Fix failed uploads"
              : when === "draft"
                ? "Save draft"
                : when === "schedule"
                  ? "Schedule post"
                  : isLiveNow
                    ? "Save changes"
                    : "Publish"}
      </button>
    </form>
  );
}
