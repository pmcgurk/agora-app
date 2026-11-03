import { themeCss } from "@/themes";

// Creator-supplied CSS, validated by isSafeCss when uploaded and again here before rendering.
export default function ThemeCss({ settings }: { settings: unknown }) {
  const css = themeCss(settings);
  return css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null;
}
