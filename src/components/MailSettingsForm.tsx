"use client";

import { useActionState, useState } from "react";
import { saveMailSettings, type MailFormState } from "@/app/actions/mail";
import { buttonClass, cardClass, inputClass } from "@/components/ui";

type Saved = { smtpHost: string; smtpPort: number | null; smtpSecure: boolean; smtpUser: string; hasPassword: boolean; mailFrom: string };

// Inputs are controlled, so a failed save leaves exactly what the owner typed on screen.
export default function MailSettingsForm({ saved }: { saved: Saved | null }) {
  const [state, action, pending] = useActionState<MailFormState, FormData>(saveMailSettings, {});
  const [host, setHost] = useState(saved?.smtpHost ?? "");
  const [port, setPort] = useState(saved?.smtpPort ? String(saved.smtpPort) : "");
  const [secure, setSecure] = useState(saved?.smtpSecure ?? false);
  const [user, setUser] = useState(saved?.smtpUser ?? "");
  const [password, setPassword] = useState("");
  const [from, setFrom] = useState(saved?.mailFrom ?? "");

  return (
    <form action={action} className={`${cardClass} space-y-4 p-5`}>
      {state.error && <p role="alert" className="rounded-theme bg-danger/10 p-3 text-sm text-danger">{state.error}</p>}
      {state.notice && <p role="status" className="rounded-theme bg-secondary p-3 text-sm text-success">{state.notice}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 text-sm font-medium">
          SMTP host
          <input name="smtpHost" required placeholder="smtp.example.com" value={host} onChange={(event) => setHost(event.target.value)} className={inputClass} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Port
          <input name="smtpPort" type="number" min="1" max="65535" placeholder="587" value={port} onChange={(event) => setPort(event.target.value)} className={inputClass} />
          <span className="block text-xs font-normal text-muted">587 (STARTTLS) is the usual choice; 465 needs the option below.</span>
        </label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="smtpSecure" checked={secure} onChange={(event) => setSecure(event.target.checked)} className="mt-1" />
          <span>
            Use TLS from the start (port 465)
            <span className="block text-xs text-muted">Leave off for port 587, which upgrades to encryption automatically.</span>
          </span>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Username
          <input name="smtpUser" autoComplete="off" value={user} onChange={(event) => setUser(event.target.value)} className={inputClass} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Password
          <input
            name="smtpPassword"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={saved?.hasPassword ? "Saved. Leave blank to keep it." : ""}
            className={inputClass}
          />
        </label>
        <label className="block space-y-1 text-sm font-medium sm:col-span-2">
          From address
          <input name="mailFrom" type="email" required placeholder="hello@example.com" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} />
          <span className="block text-xs font-normal text-muted">Must be an address your mail server is allowed to send from.</span>
        </label>
      </div>
      <button className={buttonClass} disabled={pending}>
        {pending ? "Connecting…" : "Test connection and save"}
      </button>
    </form>
  );
}
