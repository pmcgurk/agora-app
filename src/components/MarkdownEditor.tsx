"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Markdown from "@/components/Markdown";
import { inputClass } from "@/components/ui";

// The text box of the post composer: a formatting toolbar, keyboard shortcuts, inline images and a
// live preview. It writes plain Markdown, so the server never has to trust the editor's output.

export const INLINE_IMAGE_PREFIX = "upload:";

export type EditorImage = { id: string; previewUrl: string | null };

type Edit = { value: string; start: number; end: number };

// Replace [start, end) with text and select the part that matters.
function replaceRange(value: string, start: number, end: number, text: string, selectFrom: number, selectTo: number): Edit {
  const next = value.slice(0, start) + text + value.slice(end);
  return { value: next, start: start + selectFrom, end: start + selectTo };
}

// Wrap the selection, or drop a placeholder that is selected so typing replaces it.
function wrap(value: string, start: number, end: number, before: string, after: string, placeholder: string): Edit {
  const selected = value.slice(start, end) || placeholder;
  return replaceRange(value, start, end, `${before}${selected}${after}`, before.length, before.length + selected.length);
}

// Turn each selected line into a list item, quote or heading; a second press removes the prefix.
function prefixLines(value: string, start: number, end: number, prefix: string | ((index: number) => string), pattern: RegExp): Edit {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEndIndex = value.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const allPrefixed = lines.every((line) => pattern.test(line));
  const next = lines.map((line, index) => {
    if (allPrefixed) return line.replace(pattern, "");
    const bare = line.replace(/^(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/, "");
    return (typeof prefix === "function" ? prefix(index) : prefix) + bare;
  });
  const replaced = next.join("\n");
  return {
    value: value.slice(0, lineStart) + replaced + value.slice(lineEnd),
    start: lineStart,
    end: lineStart + replaced.length,
  };
}

// Blank lines around blocks so Markdown reads them as separate paragraphs.
function insertBlock(value: string, start: number, end: number, block: string, selectFrom: number, selectTo: number): Edit {
  const before = start === 0 || value[start - 1] === "\n" ? "" : "\n\n";
  const after = value.slice(end).startsWith("\n") ? "" : "\n\n";
  const text = before + block + after;
  return replaceRange(value, start, end, text, before.length + selectFrom, before.length + selectTo);
}

const TOOLS = {
  bold: (v: string, s: number, e: number) => wrap(v, s, e, "**", "**", "bold text"),
  italic: (v: string, s: number, e: number) => wrap(v, s, e, "*", "*", "italic text"),
  strike: (v: string, s: number, e: number) => wrap(v, s, e, "~~", "~~", "struck text"),
  code: (v: string, s: number, e: number) => wrap(v, s, e, "`", "`", "code"),
  codeBlock: (v: string, s: number, e: number) => insertBlock(v, s, e, "```\ncode\n```", 4, 8),
  link: (v: string, s: number, e: number) => wrap(v, s, e, "[", "](https://)", "link text"),
  h2: (v: string, s: number, e: number) => prefixLines(v, s, e, "## ", /^##\s/),
  h3: (v: string, s: number, e: number) => prefixLines(v, s, e, "### ", /^###\s/),
  quote: (v: string, s: number, e: number) => prefixLines(v, s, e, "> ", /^>\s?/),
  bullets: (v: string, s: number, e: number) => prefixLines(v, s, e, "- ", /^[-*+]\s/),
  numbered: (v: string, s: number, e: number) => prefixLines(v, s, e, (index) => `${index + 1}. `, /^\d+[.)]\s/),
  divider: (v: string, s: number, e: number) => insertBlock(v, s, e, "---", 0, 3),
} satisfies Record<string, (value: string, start: number, end: number) => Edit>;

type ToolName = keyof typeof TOOLS;

const BUTTONS: { tool: ToolName; label: string; title: string; content: ReactNode }[] = [
  { tool: "bold", label: "Bold", title: "Bold (Ctrl+B)", content: <strong>B</strong> },
  { tool: "italic", label: "Italic", title: "Italic (Ctrl+I)", content: <em>I</em> },
  { tool: "strike", label: "Strikethrough", title: "Strikethrough", content: <s>S</s> },
  { tool: "h2", label: "Heading", title: "Large heading", content: "H2" },
  { tool: "h3", label: "Subheading", title: "Small heading", content: "H3" },
  { tool: "quote", label: "Quote", title: "Block quote", content: "“ ”" },
  { tool: "bullets", label: "Bulleted list", title: "Bulleted list", content: "• list" },
  { tool: "numbered", label: "Numbered list", title: "Numbered list", content: "1. list" },
  { tool: "link", label: "Link", title: "Link (Ctrl+K)", content: "Link" },
  { tool: "code", label: "Inline code", title: "Inline code", content: "</>" },
  { tool: "codeBlock", label: "Code block", title: "Code block", content: "{ }" },
  { tool: "divider", label: "Divider", title: "Horizontal line", content: "—" },
];

export default function MarkdownEditor({
  name = "textContent",
  defaultValue = "",
  images,
  onImages,
  label,
}: {
  name?: string;
  defaultValue?: string;
  // Images already in the composer, so the preview can show them before they are published.
  images: EditorImage[];
  // Called with new inline images; the composer uploads them and returns nothing, the editor inserts the links.
  onImages: (files: File[], ids: string[]) => void;
  label?: ReactNode;
}) {
  const [value, setValue] = useState(defaultValue);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  function apply(tool: ToolName) {
    const el = area.current;
    if (!el) return;
    const edit = TOOLS[tool](value, el.selectionStart, el.selectionEnd);
    commit(edit);
  }

  function commit(edit: Edit) {
    setValue(edit.value);
    requestAnimationFrame(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(edit.start, edit.end);
    });
  }

  function insertAtCursor(text: string) {
    const el = area.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const cursor = start + text.length;
    commit({ value: value.slice(0, start) + text + value.slice(end), start: cursor, end: cursor });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey)) return;
    const shortcuts: Record<string, ToolName> = { b: "bold", i: "italic", k: "link" };
    const tool = shortcuts[event.key.toLowerCase()];
    if (tool) {
      event.preventDefault();
      apply(tool);
    }
  }

  function pickImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (list.length === 0) return;
    const ids = list.map(() => crypto.randomUUID());
    onImages(list, ids);
    // Each image becomes a placeholder that the server swaps for the real media address on publish.
    // The alt text starts empty so a file name never ends up as a caption; the writer can add one.
    insertAtCursor(list.map((_, index) => `\n\n![](${INLINE_IMAGE_PREFIX}${ids[index]})\n\n`).join(""));
    if (picker.current) picker.current.value = "";
  }

  const previews = new Map(images.filter((image) => image.previewUrl).map((image) => [`${INLINE_IMAGE_PREFIX}${image.id}`, image.previewUrl!]));
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{label ?? "Text"}</span>
        <div role="tablist" aria-label="Editor view" className="flex rounded-theme border border-line text-sm">
          {(["write", "preview"] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={mode === view}
              onClick={() => setMode(view)}
              className={`px-3 py-1 capitalize ${mode === view ? "bg-primary text-on-primary" : "text-muted hover:text-text"} ${view === "write" ? "rounded-l-theme" : "rounded-r-theme"}`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      {mode === "write" ? (
        <>
          <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-1 rounded-theme border border-line bg-surface p-1">
            {BUTTONS.map((button) => (
              <button
                key={button.tool}
                type="button"
                title={button.title}
                aria-label={button.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => apply(button.tool)}
                className="min-w-8 rounded px-2 py-1 text-sm hover:bg-secondary"
              >
                {button.content}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
            <button
              type="button"
              title="Insert images into the text"
              onClick={() => picker.current?.click()}
              className="rounded px-2 py-1 text-sm hover:bg-secondary"
            >
              Image
            </button>
            <input
              ref={picker}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              aria-label="Choose images to insert"
              onChange={(event) => pickImages(event.target.files)}
            />
          </div>
          <textarea
            ref={area}
            name={name}
            rows={14}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={(event) => {
              const files = event.clipboardData.files;
              if (files.length > 0 && Array.from(files).some((file) => file.type.startsWith("image/"))) {
                event.preventDefault();
                pickImages(files);
              }
            }}
            placeholder="Write your post. Paste or drop an image to add it inline."
            className={`${inputClass} min-h-72 font-mono text-[0.95rem] leading-relaxed`}
          />
          <p className="text-xs text-muted">
            Markdown: **bold**, *italic*, ~~strike~~, # headings, &gt; quotes, - lists, [links](https://…), ![images](…). Ctrl+B, Ctrl+I and Ctrl+K work too.
            {" "}{words} {words === 1 ? "word" : "words"}.
          </p>
        </>
      ) : (
        <>
          <input type="hidden" name={name} value={value} />
          <div className="min-h-72 rounded-theme border border-line bg-background p-5">
            {value.trim() ? (
              <Markdown source={value} resolveImage={(src) => previews.get(src) ?? (src.startsWith("/api/media/") ? src : null)} />
            ) : (
              <p className="text-muted">Nothing to preview yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
