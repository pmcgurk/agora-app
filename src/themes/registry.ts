export const COLOR_KEYS = [
  "primary",
  "onPrimary",
  "secondary",
  "background",
  "surface",
  "text",
  "muted",
  "border",
  "danger",
  "success",
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export type Palette = Record<ColorKey, string> & { radius: string; fontBody: string; fontHeading: string };

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SERIF = 'ui-serif, Georgia, Cambria, "Times New Roman", serif';

// Built-in themes. Each one has a layout in src/themes/<name>/ProfileLayout.tsx (Rule 3);
// the palette fills the --theme-* CSS variables for the whole app unless the creator uploaded a theme file.
export const THEMES: Record<string, { label: string; description: string; palette: Palette }> = {
  default: {
    label: "Classic",
    description: "Violet on white.",
    palette: {
      primary: "#6d28d9",
      onPrimary: "#ffffff",
      secondary: "#f3e8ff",
      background: "#ffffff",
      surface: "#faf5ff",
      text: "#171717",
      muted: "#6b7280",
      border: "#e9d5ff",
      danger: "#b91c1c",
      success: "#166534",
      radius: "0.5rem",
      fontBody: SANS,
      fontHeading: SANS,
    },
  },
  light: {
    label: "Light",
    description: "Bright and airy, soft card.",
    palette: {
      primary: "#2563eb",
      onPrimary: "#ffffff",
      secondary: "#e0ecff",
      background: "#f1f5f9",
      surface: "#ffffff",
      text: "#0f172a",
      muted: "#64748b",
      border: "#dbe3ee",
      danger: "#dc2626",
      success: "#15803d",
      radius: "0.9rem",
      fontBody: SANS,
      fontHeading: SANS,
    },
  },
  dark: {
    label: "Dark",
    description: "Easy on the eyes.",
    palette: {
      primary: "#a78bfa",
      onPrimary: "#14102a",
      secondary: "#262a3b",
      background: "#0f1117",
      surface: "#171a24",
      text: "#e5e7eb",
      muted: "#9ca3af",
      border: "#2b3042",
      danger: "#f87171",
      success: "#4ade80",
      radius: "0.6rem",
      fontBody: SANS,
      fontHeading: SERIF,
    },
  },
};

export const THEME_NAMES = Object.keys(THEMES);

export function isThemeName(value: unknown): value is string {
  return typeof value === "string" && Object.hasOwn(THEMES, value);
}
