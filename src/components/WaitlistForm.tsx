"use client";

import { useActionState } from "react";
import { joinWaitlist, type WaitlistState } from "@/app/actions/demo";
import { buttonClass, inputClass } from "@/components/ui";
import { submitKeepingFields } from "@/lib/form-submit";

export default function WaitlistForm({ contact }: { contact: string }) {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, {});

  if (state.done) {
    return (
      <p role="status" className="rounded-theme bg-secondary p-3 text-success">
        You&apos;re on the list. I&apos;ll email you once, when hosted Agora opens.
      </p>
    );
  }
  return (
    <form onSubmit={submitKeepingFields(action)} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="waitlist-email">Email address</label>
        <input id="waitlist-email" name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@example.com" className={inputClass} />
        {/* Only bots fill this in. */}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        <button className={`${buttonClass} shrink-0`} disabled={pending}>{pending ? "Joining…" : "Join the waitlist"}</button>
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <p className="text-sm text-muted">
        One email when hosted Agora opens, nothing else. Your address is only used for that. To be removed, email {contact}.
      </p>
    </form>
  );
}
