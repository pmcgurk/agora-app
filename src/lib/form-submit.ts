import { startTransition, type FormEvent } from "react";

// React 19 clears a form's fields once a server action finishes, even when the action only came back with an error
// ("choose a time at least a minute from now"). That wipes what the person typed. Submitting through this instead
// runs the same action and tracks the same pending state, but leaves the fields as they are.
//
//   <form onSubmit={submitKeepingFields(formAction)}>
//
// The data sent is the same as the plain `action={formAction}` form would send, including the button that was pressed.
export function submitKeepingFields(action: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => action(data));
  };
}
