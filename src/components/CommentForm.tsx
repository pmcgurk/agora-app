"use client";

import { useActionState } from "react";
import type { CommentFormState } from "@/app/actions/social";
import { buttonClass, inputClass } from "@/components/ui";

export default function CommentForm({
  postId,
  parentId,
  action,
}: {
  postId: string;
  parentId?: string;
  action: (previous: CommentFormState, formData: FormData) => Promise<CommentFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="postId" value={postId} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <label className="block">
        <span className="sr-only">Add a comment</span>
        <textarea
          key={state.sent ?? state.body ?? "empty"}
          name="body"
          rows={parentId ? 2 : 3}
          maxLength={2000}
          required
          placeholder={parentId ? "Write a reply…" : "Write a comment…"}
          defaultValue={state.body ?? ""}
          className={inputClass}
        />
      </label>
      {state.error && <p role="alert" className="text-danger">{state.error}</p>}
      <button className={buttonClass} disabled={pending}>{pending ? "Posting…" : parentId ? "Reply" : "Comment"}</button>
    </form>
  );
}
