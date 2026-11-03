import { type FontChoice, googleFontsHref } from "@/themes/fonts";

export default function FontLink({ fonts, settings }: { fonts: FontChoice; settings: unknown }) {
  const href = googleFontsHref(fonts, settings);
  if (!href) return null;
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={href} precedence="default" />
    </>
  );
}
