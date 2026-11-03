import type { Config } from "tailwindcss";

// Every color utility is backed by a --theme-* CSS variable (Rule 2). Opacity modifiers
// (bg-primary/30) use color-mix so they work with any CSS color the theme provides.
function themeColor(name: string): string {
  const color = ({ opacityValue }: { opacityValue?: string }) =>
    opacityValue === undefined || opacityValue === "1"
      ? `var(--theme-${name})`
      : `color-mix(in srgb, var(--theme-${name}) calc(${opacityValue} * 100%), transparent)`;
  // Tailwind accepts a function here, but its published types only allow strings.
  return color as unknown as string;
}

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: themeColor("primary"),
        "on-primary": themeColor("on-primary"),
        secondary: themeColor("secondary"),
        background: themeColor("background"),
        surface: themeColor("surface"),
        text: themeColor("text"),
        muted: themeColor("muted"),
        line: themeColor("border"),
        danger: themeColor("danger"),
        success: themeColor("success"),
      },
      borderRadius: { theme: "var(--theme-radius)" },
      fontFamily: { heading: "var(--theme-font-heading)" },
    },
  },
  plugins: [],
};

export default config;
