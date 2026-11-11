import { describe, expect, it } from "vitest";
import { DEFAULT_EMAIL_THEME, emailThemeFor } from "@/lib/email-theme";

describe("the colours and fonts of a creator's blog, for email", () => {
  it("falls back to the default look", () => {
    expect(emailThemeFor(null)).toEqual(DEFAULT_EMAIL_THEME);
    expect(DEFAULT_EMAIL_THEME.primary).toBe("#6d28d9");
  });

  it("follows the creator's chosen theme", () => {
    expect(emailThemeFor({ themeName: "light" }).primary).toBe("#2563eb");
    expect(emailThemeFor({ themeName: "dark" }).background).not.toBe(DEFAULT_EMAIL_THEME.background);
  });

  it("applies colours from an uploaded theme file", () => {
    const theme = emailThemeFor({ themeName: "default", themeSettings: { primary: "#ff0066", surface: "rgb(10, 20, 30)" } });
    expect(theme.primary).toBe("#ff0066");
    expect(theme.surface).toBe("rgb(10, 20, 30)");
  });

  it("ignores a colour that is not a plain colour, so it cannot reach a style attribute", () => {
    const theme = emailThemeFor({ themeSettings: { primary: 'red;}</style><script>alert(1)</script>', text: "url(http://evil)" } });
    expect(theme.primary).toBe(DEFAULT_EMAIL_THEME.primary);
    expect(theme.text).toBe(DEFAULT_EMAIL_THEME.text);
  });

  it("turns a radius in rem into pixels, within reason", () => {
    expect(emailThemeFor({ themeName: "default" }).radiusPx).toBe(8);
    expect(emailThemeFor({ themeSettings: { radius: "1.5rem" } }).radiusPx).toBe(24);
    expect(emailThemeFor({ themeSettings: { radius: "12px" } }).radiusPx).toBe(12);
    expect(emailThemeFor({ themeSettings: { radius: "99rem" } }).radiusPx).toBe(24); // capped
  });

  it("uses the fonts from appearance settings, always with a fallback every device has", () => {
    const theme = emailThemeFor({ fontBody: "lora", fontHeading: "playfair-display" });
    expect(theme.fontBody).toContain("Lora");
    expect(theme.fontBody).toContain("Georgia");
    expect(theme.fontHeading).toContain("Playfair Display");
    expect(DEFAULT_EMAIL_THEME.fontBody).toMatch(/Helvetica|Arial/);
  });
});
