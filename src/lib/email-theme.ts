import { fontFamily } from "@/themes/fonts";
import { COLOR_KEYS, isThemeName, THEMES, type ColorKey } from "@/themes/registry";

// Email clients do not understand CSS variables, classes or most of a stylesheet, so an email is built from plain
// values: the colours and fonts of the creator's blog theme, resolved once and written inline into every element.

export type EmailTheme = Record<ColorKey, string> & {
  // The blog uses rem; email uses pixels.
  radiusPx: number;
  fontBody: string;
  fontHeading: string;
};

// The same patterns the blog uses before it accepts a colour or a font from a theme file, so a value that is not
// safe for the page is not written into an email either.
const COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|(rgb|hsl)a?\([0-9\s.,%/-]+\))$/;
const RADIUS = /^(\d{1,2}(?:\.\d{1,2})?)(px|rem|em)$/;
const FONT = /^[\w\s,'"-]{1,120}$/;

// Web fonts rarely load in email, so the stack always ends in something every device has.
const SAFE_SANS = 'Helvetica, Arial, sans-serif';
const SAFE_SERIF = "Georgia, 'Times New Roman', serif";

function withFallback(stack: string): string {
  const lower = stack.toLowerCase();
  if (/\bserif\b/.test(lower) && !lower.includes("sans-serif")) return `${stack}, ${SAFE_SERIF}`;
  return `${stack}, ${SAFE_SANS}`;
}

function radiusToPx(value: string, fallback: number): number {
  const match = RADIUS.exec(value);
  if (!match) return fallback;
  const amount = Number(match[1]);
  return Math.min(24, Math.round(match[2] === "px" ? amount : amount * 16));
}

type ThemeSource = {
  themeName?: string | null;
  themeSettings?: unknown;
  fontBody?: string | null;
  fontHeading?: string | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

// The colours and fonts a creator's blog uses, as values an email can carry. No creator means the default look.
export function emailThemeFor(source: ThemeSource | null | undefined): EmailTheme {
  const palette = (source?.themeName && isThemeName(source.themeName) ? THEMES[source.themeName] : THEMES.default).palette;
  const colors = {} as Record<ColorKey, string>;
  for (const key of COLOR_KEYS) colors[key] = palette[key];
  let radius = palette.radius;
  let body = palette.fontBody;
  let heading = palette.fontHeading;

  const custom = asRecord(source?.themeSettings);
  if (custom) {
    for (const key of COLOR_KEYS) {
      const value = custom[key];
      if (typeof value === "string" && COLOR.test(value.trim())) colors[key] = value.trim();
    }
    if (typeof custom.radius === "string" && RADIUS.test(custom.radius)) radius = custom.radius;
    if (typeof custom.fontBody === "string" && FONT.test(custom.fontBody)) body = custom.fontBody;
    if (typeof custom.fontHeading === "string" && FONT.test(custom.fontHeading)) heading = custom.fontHeading;
  }
  // A font picked in the appearance settings wins over the theme's own, as on the blog.
  body = fontFamily(source?.fontBody) ?? body;
  heading = fontFamily(source?.fontHeading) ?? heading;

  return {
    ...colors,
    radiusPx: radiusToPx(radius, 8),
    fontBody: withFallback(body),
    fontHeading: withFallback(heading),
  };
}

export const DEFAULT_EMAIL_THEME: EmailTheme = emailThemeFor(null);
