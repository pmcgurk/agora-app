import { describe, expect, it } from "vitest";
import { collectForm, isRemembered, isUsable, parseSaved, planRestore, type FieldLike } from "@/lib/form-memory";

const field = (overrides: Partial<FieldLike> & { name: string }): FieldLike => ({ type: "text", value: "", defaultValue: "", ...overrides });
const page = { path: "/dashboard/posts/new", index: 1, now: 1_000_000 };

describe("what is remembered", () => {
  it("never remembers passwords, files, hidden values or buttons", () => {
    for (const type of ["password", "file", "hidden", "submit", "button", "reset", "image"]) {
      expect(isRemembered(field({ name: "x", type }))).toBe(false);
    }
  });

  it("never remembers a field with no name, a disabled one, or one that opts out", () => {
    expect(isRemembered(field({ name: "" }))).toBe(false);
    expect(isRemembered(field({ name: "x", disabled: true }))).toBe(false);
    expect(isRemembered(field({ name: "x", noRestore: true }))).toBe(false);
  });

  it("keeps what was typed and chosen, and leaves a password out", () => {
    const saved = collectForm(
      [
        field({ name: "title", value: "My post" }),
        field({ name: "textContent", type: "textarea", value: "Hello" }),
        field({ name: "publishAt", type: "datetime-local", value: "2026-12-01T09:00" }),
        field({ name: "password", type: "password", value: "hunter2" }),
        field({ name: "when", type: "radio", value: "now", checked: false }),
        field({ name: "when", type: "radio", value: "schedule", checked: true }),
      ],
      page,
    )!;
    expect(saved.values).toEqual({ title: ["My post"], textContent: ["Hello"], publishAt: ["2026-12-01T09:00"], when: ["schedule"] });
    expect(JSON.stringify(saved)).not.toContain("hunter2");
    expect(saved.names).not.toContain("password");
  });

  it("remembers that a box was left un-ticked", () => {
    const saved = collectForm([field({ name: "sendEmail", type: "checkbox", value: "on", checked: false, defaultChecked: true })], page)!;
    expect(saved.names).toContain("sendEmail");
    expect(saved.values.sendEmail).toBeUndefined();
  });

  it("has nothing to remember in a form of only buttons and secrets", () => {
    expect(collectForm([field({ name: "password", type: "password", value: "x" }), field({ name: "go", type: "submit" })], page)).toBeNull();
  });
});

describe("putting it back", () => {
  const saved = collectForm(
    [
      field({ name: "title", value: "My post" }),
      field({ name: "when", type: "radio", value: "schedule", checked: true }),
      field({ name: "when", type: "radio", value: "now", checked: false }),
      field({ name: "sendEmail", type: "checkbox", value: "on", checked: false, defaultChecked: true }),
    ],
    page,
  )!;

  it("restores text that the page emptied", () => {
    const empty = field({ name: "title", value: "", defaultValue: "" });
    const changes = planRestore([empty], saved);
    expect(changes).toEqual([{ field: empty, value: "My post" }]);
  });

  it("does not overwrite something the person has typed since", () => {
    expect(planRestore([field({ name: "title", value: "Newer", defaultValue: "" })], saved)).toEqual([]);
  });

  it("does nothing when the value is already there", () => {
    expect(planRestore([field({ name: "title", value: "My post", defaultValue: "My post" })], saved)).toEqual([]);
  });

  it("selects the choice that was made, and un-ticks a box the page ticked again", () => {
    const now = field({ name: "when", type: "radio", value: "now", checked: true, defaultChecked: true });
    const schedule = field({ name: "when", type: "radio", value: "schedule", checked: false, defaultChecked: false });
    const send = field({ name: "sendEmail", type: "checkbox", value: "on", checked: true, defaultChecked: true });
    const changes = planRestore([now, schedule, send], saved);
    expect(changes).toContainEqual({ field: now, checked: false });
    expect(changes).toContainEqual({ field: schedule, checked: true });
    expect(changes).toContainEqual({ field: send, checked: false });
  });

  it("ignores fields that were not in the remembered form", () => {
    expect(planRestore([field({ name: "other", value: "", defaultValue: "" })], saved)).toEqual([]);
  });

  it("matches repeated names by position", () => {
    const twice = collectForm([field({ name: "link", value: "a" }), field({ name: "link", value: "b" })], page)!;
    const first = field({ name: "link" });
    const second = field({ name: "link" });
    expect(planRestore([first, second], twice)).toEqual([
      { field: first, value: "a" },
      { field: second, value: "b" },
    ]);
  });
});

describe("when it applies", () => {
  const saved = collectForm([field({ name: "title", value: "x" })], page)!;

  it("is only for the same page, and only for a couple of minutes", () => {
    expect(isUsable(saved, "/dashboard/posts/new", page.now + 5_000)).toBe(true);
    expect(isUsable(saved, "/dashboard/tiers", page.now + 5_000)).toBe(false);
    expect(isUsable(saved, "/dashboard/posts/new", page.now + 5 * 60_000)).toBe(false);
    expect(isUsable(null, "/dashboard/posts/new", page.now)).toBe(false);
  });

  it("ignores stored text that is not ours", () => {
    expect(parseSaved(null)).toBeNull();
    expect(parseSaved("not json")).toBeNull();
    expect(parseSaved('{"path":1}')).toBeNull();
    expect(parseSaved(JSON.stringify(saved))).toEqual(saved);
  });
});
