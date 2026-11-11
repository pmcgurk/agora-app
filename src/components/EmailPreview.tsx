"use client";

import { useState } from "react";

// Shows an email the way an inbox would: who it is from, the subject, then the message at desktop or phone width,
// or as plain text. The message is drawn in a sandboxed frame with no scripts, so nothing in it can act on this page.
type Props = {
  subject: string;
  from: string;
  replyTo: string | null;
  to: string;
  html: string;
  text: string;
};

const WIDTHS = { desktop: 640, phone: 375 } as const;

export default function EmailPreview({ subject, from, replyTo, to, html, text }: Props) {
  const [width, setWidth] = useState<keyof typeof WIDTHS>("desktop");
  const [view, setView] = useState<"html" | "text">("html");
  const tab = (active: boolean) =>
    `rounded-theme border px-3 py-1 text-sm ${active ? "border-primary bg-primary text-on-primary" : "border-line hover:border-primary"}`;

  return (
    <div className="space-y-3">
      <div role="group" aria-label="How to view the email" className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setView("html"); setWidth("desktop"); }} aria-pressed={view === "html" && width === "desktop"} className={tab(view === "html" && width === "desktop")}>
          Desktop
        </button>
        <button type="button" onClick={() => { setView("html"); setWidth("phone"); }} aria-pressed={view === "html" && width === "phone"} className={tab(view === "html" && width === "phone")}>
          Phone
        </button>
        <button type="button" onClick={() => setView("text")} aria-pressed={view === "text"} className={tab(view === "text")}>
          Plain text
        </button>
      </div>

      <div className="overflow-hidden rounded-theme border border-line">
        <dl className="space-y-0.5 border-b border-line bg-secondary px-4 py-3 text-sm">
          <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted">From</dt><dd className="min-w-0 break-words">{from}</dd></div>
          {replyTo && <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted">Reply-to</dt><dd className="min-w-0 break-words">{replyTo}</dd></div>}
          <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted">To</dt><dd className="min-w-0 break-words">{to}</dd></div>
          <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted">Subject</dt><dd className="min-w-0 break-words font-medium">{subject}</dd></div>
        </dl>
        {view === "html" ? (
          <div className="overflow-x-auto bg-white p-0">
            <iframe
              title={`Preview of the email “${subject}”`}
              srcDoc={html}
              sandbox=""
              style={{ width: WIDTHS[width], maxWidth: "100%", height: 720, border: 0, display: "block", margin: "0 auto" }}
            />
          </div>
        ) : (
          <pre className="max-h-[720px] overflow-auto whitespace-pre-wrap break-words bg-surface p-4 text-sm">{text}</pre>
        )}
      </div>
    </div>
  );
}
