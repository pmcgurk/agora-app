"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { collectForm, isUsable, parseSaved, planRestore, type FieldLike } from "@/lib/form-memory";

// Forms on this site send you back to the page with an error when something is wrong, which rebuilds the page and
// would empty every field. This remembers what was typed at the moment of submitting (never passwords or files) and
// puts it back when the page comes back with an error. It lives for two minutes, in this tab only.
const KEY = "agora:form-memory";

type Element = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function describe(element: Element): FieldLike {
  const input = element as HTMLInputElement;
  return {
    name: element.name,
    type: element.type,
    value: element.value,
    defaultValue: element instanceof HTMLSelectElement ? element.value : (element as HTMLInputElement | HTMLTextAreaElement).defaultValue,
    checked: input.checked,
    defaultChecked: input.defaultChecked,
    disabled: element.disabled,
    noRestore: element.dataset.noRestore !== undefined,
    selected: element instanceof HTMLSelectElement && element.multiple ? Array.from(element.selectedOptions).map((option) => option.value) : undefined,
  };
}

const controls = (form: HTMLFormElement): Element[] =>
  Array.from(form.elements).filter((el): el is Element => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement);

// Sets a value the way a person typing would, so a controlled field (one that keeps its text in React state) notices.
function setValue(element: Element, value: string) {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

function restore() {
  let saved;
  try {
    saved = parseSaved(sessionStorage.getItem(KEY));
  } catch {
    return;
  }
  if (!isUsable(saved, location.pathname, Date.now())) return;
  const form = document.forms[saved.index];
  if (!form) return;
  const elements = controls(form);
  const described = elements.map(describe);
  for (const change of planRestore(described, saved)) {
    const element = elements[described.indexOf(change.field)];
    if (!element) continue;
    if (change.checked !== undefined) {
      // A click changes the box and tells React, in one go.
      if ((element as HTMLInputElement).checked !== change.checked) (element as HTMLInputElement).click();
    } else if (change.value !== undefined) {
      setValue(element, change.value);
    }
  }
}

export default function FormMemory() {
  const pathname = usePathname();
  const search = useSearchParams();
  const failed = search.has("error");

  // Remember the form being submitted, just before the page leaves.
  useEffect(() => {
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const saved = collectForm(controls(form).map(describe), {
        path: location.pathname,
        index: Array.from(document.forms).indexOf(form),
        now: Date.now(),
      });
      try {
        if (saved) sessionStorage.setItem(KEY, JSON.stringify(saved));
      } catch {
        // storage can be blocked; the form just behaves as it always did
      }
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  // Put it back when the same page returns with an error. The page can still be settling (React clears a form after
  // an action finishes), so it is tried again a moment later; a field the person already changed is never touched.
  useEffect(() => {
    if (!failed) return;
    const timers = [0, 80, 300].map((delay) => window.setTimeout(restore, delay));
    // Done: forget it, so it can never come back on a later visit.
    timers.push(
      window.setTimeout(() => {
        try {
          sessionStorage.removeItem(KEY);
        } catch {
          // nothing to do
        }
      }, 800),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [pathname, search, failed]);

  return null;
}
