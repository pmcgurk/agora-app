// When a form is submitted and the server sends the person back to the same page with an error, the page is built
// again and everything they typed is gone. These functions remember what was typed at the moment of submitting and
// work out what to put back afterwards. They only look at the shape of a form field, so they can be tested without a
// browser; components/FormMemory.tsx does the actual listening and writing.

export type FieldLike = {
  name: string;
  type: string;
  value: string;
  defaultValue?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  // Set on a field that must never be remembered (data-no-restore).
  noRestore?: boolean;
  // For <select multiple>: the values currently selected.
  selected?: string[];
};

export type SavedForm = {
  // The page it was on, without the query string.
  path: string;
  at: number;
  // Which form on the page it was (its position among the page's forms).
  index: number;
  // Every remembered field name, so a box that was un-ticked can be un-ticked again after the page resets it.
  names: string[];
  values: Record<string, string[]>;
};

// Secrets, files and buttons are never remembered. Only what a person typed or chose.
const NEVER = new Set(["password", "file", "hidden", "submit", "button", "reset", "image"]);

export function isRemembered(field: FieldLike): boolean {
  return field.name !== "" && !field.disabled && !field.noRestore && !NEVER.has(field.type);
}

export function collectForm(fields: FieldLike[], page: { path: string; index: number; now: number }): SavedForm | null {
  const names = new Set<string>();
  const values: Record<string, string[]> = {};
  for (const field of fields) {
    if (!isRemembered(field)) continue;
    names.add(field.name);
    if (field.type === "checkbox" || field.type === "radio") {
      if (field.checked) (values[field.name] ??= []).push(field.value);
    } else if (field.type === "select-multiple") {
      values[field.name] = field.selected ?? [];
    } else {
      (values[field.name] ??= []).push(field.value);
    }
  }
  if (names.size === 0) return null;
  return { path: page.path, at: page.now, index: page.index, names: [...names], values };
}

export type Change = { field: FieldLike; value?: string; checked?: boolean };

// What to put back. A field the person has already changed since the page loaded is left alone, and a field that
// already holds the remembered value needs nothing.
export function planRestore(fields: FieldLike[], saved: SavedForm): Change[] {
  const changes: Change[] = [];
  const seen: Record<string, number> = {};
  for (const field of fields) {
    if (!isRemembered(field) || !saved.names.includes(field.name)) continue;
    const list = saved.values[field.name] ?? [];
    if (field.type === "checkbox" || field.type === "radio") {
      const want = list.includes(field.value);
      if ((field.checked ?? false) !== want && (field.checked ?? false) === (field.defaultChecked ?? false)) changes.push({ field, checked: want });
    } else if (field.type === "select-multiple") {
      // Left to the browser: restoring several selections one by one is more trouble than it is worth.
    } else {
      const n = (seen[field.name] = (seen[field.name] ?? -1) + 1);
      const want = list[n] ?? "";
      const untouched = field.value === (field.defaultValue ?? "");
      if (untouched && field.value !== want) changes.push({ field, value: want });
    }
  }
  return changes;
}

const MAX_AGE_MS = 2 * 60_000;

export function isUsable(saved: SavedForm | null, path: string, now: number): saved is SavedForm {
  return saved !== null && saved.path === path && now - saved.at >= 0 && now - saved.at <= MAX_AGE_MS;
}

export function parseSaved(raw: string | null): SavedForm | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SavedForm>;
    if (
      typeof value.path === "string" &&
      typeof value.at === "number" &&
      typeof value.index === "number" &&
      Array.isArray(value.names) &&
      value.names.every((name) => typeof name === "string") &&
      value.values &&
      typeof value.values === "object"
    ) {
      return value as SavedForm;
    }
  } catch {
    // not ours, or damaged: ignore it
  }
  return null;
}
