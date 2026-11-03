// A short, curated list of Google Fonts. Only the fonts a creator picks are requested.
export const FONTS = [
  { key: "inter", label: "Inter", family: "'Inter', sans-serif", google: "Inter:wght@400;500;600;700" },
  { key: "poppins", label: "Poppins", family: "'Poppins', sans-serif", google: "Poppins:wght@400;500;600;700" },
  { key: "dm-sans", label: "DM Sans", family: "'DM Sans', sans-serif", google: "DM+Sans:wght@400;500;700" },
  { key: "nunito", label: "Nunito", family: "'Nunito', sans-serif", google: "Nunito:wght@400;600;700" },
  { key: "space-grotesk", label: "Space Grotesk", family: "'Space Grotesk', sans-serif", google: "Space+Grotesk:wght@400;500;700" },
  { key: "lora", label: "Lora", family: "'Lora', serif", google: "Lora:wght@400;500;600;700" },
  { key: "merriweather", label: "Merriweather", family: "'Merriweather', serif", google: "Merriweather:wght@400;700" },
  { key: "playfair-display", label: "Playfair Display", family: "'Playfair Display', serif", google: "Playfair+Display:wght@400;600;700" },
] as const;

export type FontKey = (typeof FONTS)[number]["key"];

export const isFontKey = (value: string): value is FontKey => FONTS.some((font) => font.key === value);

const byKey = (key: string | null | undefined) => FONTS.find((font) => font.key === key);

export type FontChoice = { fontBody?: string | null; fontHeading?: string | null };

export function fontFamily(key: string | null | undefined): string | null {
  return byKey(key)?.family ?? null;
}

// Stylesheet URL for the picked fonts (and any uploaded theme that names one of them), or null.
export function googleFontsHref(choice: FontChoice, settings: unknown): string | null {
  const custom = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const families = [choice.fontBody, choice.fontHeading]
    .map((key) => byKey(key))
    .concat([custom.fontBody, custom.fontHeading].map((value) => FONTS.find((font) => font.family === value)));
  const specs = [...new Set(families.flatMap((font) => (font ? [font.google] : [])))];
  if (specs.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${specs.map((spec) => `family=${spec}`).join("&")}&display=swap`;
}

// Every font in the list, used by the picker so each option can be shown in its own typeface.
export const allFontsHref = `https://fonts.googleapis.com/css2?${FONTS.map((font) => `family=${font.google}`).join("&")}&display=swap`;
