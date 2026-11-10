"use client";

import { useState, type CSSProperties } from "react";
import { saveCustomColours } from "@/app/actions/settings";
import { buttonClass } from "@/components/ui";

export const COLOUR_FIELDS = [
  { key: "primary", label: "Accent", hint: "Buttons and links" },
  { key: "onPrimary", label: "Text on accent", hint: "Label colour on buttons" },
  { key: "secondary", label: "Soft accent", hint: "Chips and highlights" },
  { key: "background", label: "Page background", hint: "Behind everything" },
  { key: "surface", label: "Cards", hint: "Post and panel background" },
  { key: "text", label: "Text", hint: "Headings and body" },
  { key: "muted", label: "Secondary text", hint: "Captions and metadata" },
  { key: "border", label: "Borders", hint: "Dividers and outlines" },
  { key: "danger", label: "Errors", hint: "Error messages" },
  { key: "success", label: "Success", hint: "Confirmations" },
] as const;

export const RADIUS_OPTIONS = [
  { value: "0px", label: "Square" },
  { value: "0.25rem", label: "Subtle" },
  { value: "0.5rem", label: "Rounded" },
  { value: "0.6rem", label: "Medium" },
  { value: "0.9rem", label: "Soft" },
  { value: "1.25rem", label: "Pill-ish" },
];

type Colours = Record<string, string>;

// Colour pickers with a live preview. The preview uses the same --theme-* tokens as the real site,
// scoped to its own box, so what you see here is what visitors get.
export default function ColourEditor({ initial, initialRadius }: { initial: Colours; initialRadius: string }) {
  const [colours, setColours] = useState<Colours>(initial);
  const [radius, setRadius] = useState(initialRadius);

  const previewVars = {
    ...Object.fromEntries(Object.entries(colours).map(([key, value]) => [`--theme-${toKebab(key)}`, value])),
    "--theme-radius": radius,
  } as CSSProperties;

  return (
    <form action={saveCustomColours} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {COLOUR_FIELDS.map((field) => (
          <label key={field.key} className="flex items-center justify-between gap-3 rounded-theme border border-line p-3">
            <span>
              <span className="block font-medium">{field.label}</span>
              <span className="block text-xs text-muted">{field.hint}</span>
            </span>
            <input
              type="color"
              name={field.key}
              aria-label={field.label}
              value={colours[field.key] ?? "#000000"}
              onChange={(event) => setColours((current) => ({ ...current, [field.key]: event.target.value }))}
              className="h-9 w-14 cursor-pointer rounded-sm border border-line bg-transparent p-0"
            />
          </label>
        ))}
      </div>

      <label className="block space-y-1 text-sm font-medium">
        Corner roundness
        <select
          name="radius"
          value={radius}
          onChange={(event) => setRadius(event.target.value)}
          className="w-full rounded-theme border border-line bg-surface px-3 py-2 text-text sm:w-64"
        >
          {(RADIUS_OPTIONS.some((option) => option.value === radius)
            ? RADIUS_OPTIONS
            : [{ value: radius, label: `Custom (${radius})` }, ...RADIUS_OPTIONS]
          ).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div>
        <p className="mb-2 text-sm font-medium">Preview</p>
        <div className="rounded-theme p-4" style={{ ...previewVars, background: "var(--theme-background)", color: "var(--theme-text)" }}>
          <div className="rounded-theme border p-4" style={{ background: "var(--theme-surface)", borderColor: "var(--theme-border)", borderRadius: "var(--theme-radius)" }}>
            <p className="font-heading text-lg font-bold">Post title</p>
            <p className="mt-1 text-sm" style={{ color: "var(--theme-muted)" }}>
              Posted by you · 2 days ago
            </p>
            <p className="mt-2 text-sm">A short line of body text to check contrast.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-block px-4 py-2 text-sm font-medium" style={{ background: "var(--theme-primary)", color: "var(--theme-on-primary)", borderRadius: "var(--theme-radius)" }}>
                Subscribe
              </span>
              <span className="inline-block px-3 py-1.5 text-xs" style={{ background: "var(--theme-secondary)", borderRadius: "var(--theme-radius)" }}>
                Tier
              </span>
              <span className="text-sm font-medium" style={{ color: "var(--theme-danger)" }}>
                Error
              </span>
              <span className="text-sm font-medium" style={{ color: "var(--theme-success)" }}>
                Saved
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className={buttonClass}>Save colours</button>
        <p className="text-sm text-muted">Saving turns these into a custom theme.</p>
      </div>
    </form>
  );
}

function toKebab(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
