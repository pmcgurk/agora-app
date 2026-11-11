import type { ComponentType, CSSProperties, ReactNode } from "react";
import { fontFamily, type FontChoice } from "@/themes/fonts";
import { COLOR_KEYS, isThemeName, THEMES } from "@/themes/registry";

export type ProfileLayoutProps = { children: ReactNode };
export type ProfileLayoutComponent = ComponentType<ProfileLayoutProps>;

export const COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|(rgb|hsl)a?\([0-9\s.,%/-]+\))$/;
export const RADIUS_PATTERN = /^\d{1,2}(\.\d{1,2})?(px|rem|em)$/;
export const FONT_PATTERN = /^[\w\s,'"-]{1,120}$/;
export const MAX_CSS_LENGTH = 10_000;

// Custom CSS may restyle anything, but it can never load resources or break out of the <style> tag.
const FORBIDDEN_CSS = /@import|@charset|@namespace|@font-face|url\s*\(|image-set\s*\(|src\s*\(|expression\s*\(|javascript:|behavior\s*:|-moz-binding|[<\\]/i;

export function isSafeCss(css: string): boolean {
  return css.length <= MAX_CSS_LENGTH && !FORBIDDEN_CSS.test(css);
}

// Layouts live in src/themes/<themeName>/ProfileLayout.tsx; unknown names fall back to default.
export async function loadProfileLayout(themeName: string): Promise<ProfileLayoutComponent> {
  if (isThemeName(themeName)) {
    try {
      return (await import(`./${themeName}/ProfileLayout`)).default;
    } catch {
      // fall through to the default theme
    }
  }
  return (await import("./default/ProfileLayout")).default;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

// Built-in palette first, then any values from the creator's uploaded theme file. Unsafe values
// are ignored, so user.themeSettings can never inject arbitrary CSS through the variables.
export function themeStyle(themeName: string, settings: unknown, fonts?: FontChoice): CSSProperties {
  const palette = (isThemeName(themeName) ? THEMES[themeName] : THEMES.default).palette;
  const style: Record<string, string> = {};
  for (const key of COLOR_KEYS) style[`--theme-${toKebab(key)}`] = palette[key];
  style["--theme-radius"] = palette.radius;
  style["--theme-font-body"] = palette.fontBody;
  style["--theme-font-heading"] = palette.fontHeading;

  const custom = asRecord(settings);
  if (custom) {
    for (const key of COLOR_KEYS) {
      const value = custom[key];
      if (typeof value === "string" && COLOR_PATTERN.test(value.trim())) style[`--theme-${toKebab(key)}`] = value.trim();
    }
    if (typeof custom.radius === "string" && RADIUS_PATTERN.test(custom.radius)) style["--theme-radius"] = custom.radius;
    if (typeof custom.fontBody === "string" && FONT_PATTERN.test(custom.fontBody)) style["--theme-font-body"] = custom.fontBody;
    if (typeof custom.fontHeading === "string" && FONT_PATTERN.test(custom.fontHeading)) {
      style["--theme-font-heading"] = custom.fontHeading;
    }
  }
  // A font picked in the appearance settings wins over the theme's own.
  const body = fontFamily(fonts?.fontBody);
  const heading = fontFamily(fonts?.fontHeading);
  if (body) style["--theme-font-body"] = body;
  if (heading) style["--theme-font-heading"] = heading;
  return style as CSSProperties;
}

// Dark colors only: the admin dark mode keeps the instance's radius and fonts.
export function adminDarkStyle(): CSSProperties {
  const palette = THEMES.dark.palette;
  const style: Record<string, string> = {};
  for (const key of COLOR_KEYS) style[`--theme-${toKebab(key)}`] = palette[key];
  return style as CSSProperties;
}

function toKebab(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function themeCss(settings: unknown): string | null {
  const css = asRecord(settings)?.css;
  return typeof css === "string" && css.trim() && isSafeCss(css) ? css : null;
}

export function customThemeName(settings: unknown): string | null {
  const custom = asRecord(settings);
  if (!custom) return null;
  if (typeof custom.name === "string" && custom.name.trim()) return custom.name.trim().slice(0, 40);
  return Object.keys(custom).length > 0 ? "Custom theme" : null;
}

type ParsedTheme = { settings: Record<string, string> } | { error: string };

// Accepts {"name", "colors": {...}, "radius", "fonts": {"body","heading"}, "css"} or the same keys flat.
export function parseThemeFile(parsed: unknown): ParsedTheme {
  const root = asRecord(parsed);
  if (!root) return { error: "The theme file must be a JSON object." };
  const colors = asRecord(root.colors) ?? root;
  const fonts = asRecord(root.fonts) ?? root;
  const settings: Record<string, string> = {};

  for (const key of COLOR_KEYS) {
    const value = colors[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !COLOR_PATTERN.test(value.trim())) {
      return { error: `"${key}" must be a CSS color such as #1d4ed8 or rgb(29, 78, 216).` };
    }
    settings[key] = value.trim();
  }
  if (root.radius !== undefined) {
    if (typeof root.radius !== "string" || !RADIUS_PATTERN.test(root.radius)) {
      return { error: '"radius" must be a size like 0.5rem or 8px.' };
    }
    settings.radius = root.radius;
  }
  for (const [key, source] of [["fontBody", fonts.body ?? root.fontBody], ["fontHeading", fonts.heading ?? root.fontHeading]] as const) {
    if (source === undefined) continue;
    if (typeof source !== "string" || !FONT_PATTERN.test(source)) {
      return { error: `The ${key === "fontBody" ? "body" : "heading"} font must be a font-family list.` };
    }
    settings[key] = source;
  }
  if (root.css !== undefined) {
    if (typeof root.css !== "string" || !isSafeCss(root.css)) {
      return { error: `"css" must be plain CSS under ${MAX_CSS_LENGTH} characters, without url(), @import, @font-face or backslashes.` };
    }
    if (root.css.trim()) settings.css = root.css;
  }
  if (Object.keys(settings).length === 0) return { error: "The theme file has nothing to apply." };

  // Control characters are stripped on purpose.
  // oxlint-disable-next-line no-control-regex
  const name = typeof root.name === "string" ? root.name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40) : "";
  if (name) settings.name = name;
  return { settings };
}
