"use client";

import { useEffect, useRef, useState } from "react";
import { FONTS } from "@/themes/fonts";

type Option = { value: string; label: string; family?: string };

const OPTIONS: Option[] = [
  { value: "", label: "Theme default" },
  ...FONTS.map((font) => ({ value: font.key, label: font.label, family: font.family })),
];

// A listbox instead of <select>, because native option lists can't reliably show each font.
export default function FontSelect({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = OPTIONS.find((option) => option.value === value) ?? OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const move = (step: number) => {
    const index = OPTIONS.findIndex((option) => option.value === value);
    setValue(OPTIONS[(index + step + OPTIONS.length) % OPTIONS.length].value);
  };

  return (
    <div ref={root} className="relative">
      <span id={`${name}-label`} className="block">{label}</span>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${name}-label`}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          else if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
          else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
        }}
        style={{ fontFamily: current.family }}
        className="agora-input flex w-full items-center justify-between rounded-theme border border-line bg-surface px-3 py-2 text-left text-text"
      >
        {current.label}
        <span aria-hidden="true" className="text-muted">▾</span>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-labelledby={`${name}-label`}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-theme border border-line bg-surface py-1 shadow-lg"
        >
          {OPTIONS.map((option) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                setValue(option.value);
                setOpen(false);
              }}
              style={{ fontFamily: option.family }}
              className={`cursor-pointer px-3 py-2 text-lg hover:bg-secondary ${option.value === value ? "text-primary" : ""}`}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
