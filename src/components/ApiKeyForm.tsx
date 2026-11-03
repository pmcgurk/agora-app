"use client";

import { useActionState } from "react";
import { type ApiKeyState, generateApiKey } from "@/app/actions/developer";
import { buttonClass, inputClass } from "@/components/ui";

// The key is shown once, here, and never stored in plain text.
export default function ApiKeyForm() {
  const [state, action, pending] = useActionState<ApiKeyState, FormData>(generateApiKey, {});
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label>
          Key name
          <input name="name" required maxLength={60} placeholder="e.g. Discord bot" className={inputClass} />
        </label>
        <button disabled={pending} className={buttonClass}>Generate key</button>
      </form>
      {state.error && <p role="alert" className="text-danger">{state.error}</p>}
      {state.key && (
        <div role="status" className="agora-card space-y-2 rounded-theme border border-line bg-surface p-3">
          <p className="font-medium">Copy your key now. You won&rsquo;t be able to see it again.</p>
          <code data-api-key className="block break-all rounded-theme bg-secondary p-2">{state.key}</code>
        </div>
      )}
    </div>
  );
}
