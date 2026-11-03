"use client";

import { useState } from "react";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  label: string;
  message: string;
  confirmLabel?: string;
};

// Two-step button: the first click asks for confirmation, only the second submits the action.
export default function ConfirmAction({ action, fields, label, message, confirmLabel = "Yes, delete" }: Props) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button type="button" className="text-sm text-danger underline" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <form action={action} role="alertdialog" aria-label={message} className="flex flex-wrap items-center gap-2 text-sm">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <span>{message}</span>
      <button className="rounded-theme bg-danger px-2 py-1 text-on-primary">{confirmLabel}</button>
      <button type="button" className="underline" onClick={() => setAsking(false)}>Cancel</button>
    </form>
  );
}
