import { removeTheme, saveAppearance, uploadTheme } from "@/app/actions/settings";
import ColourEditor from "@/components/ColourEditor";
import Flash from "@/components/Flash";
import FontSelect from "@/components/FontSelect";
import { buttonClass, cardClass, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { COLOR_PATTERN, customThemeName, RADIUS_PATTERN } from "@/themes";
import { allFontsHref } from "@/themes/fonts";
import { COLOR_KEYS, isThemeName, THEMES } from "@/themes/registry";

export const dynamic = "force-dynamic";

const SAMPLE = `{
  "name": "Ocean",
  "colors": {
    "primary": "#0e7490",
    "onPrimary": "#ffffff",
    "secondary": "#cffafe",
    "background": "#ffffff",
    "surface": "#f0fdff",
    "text": "#0f172a",
    "muted": "#64748b",
    "border": "#a5f3fc",
    "danger": "#b91c1c",
    "success": "#166534"
  },
  "radius": "1rem",
  "fonts": { "body": "Georgia, serif", "heading": "Georgia, serif" },
  "css": ".agora-card { box-shadow: 0 2px 10px rgb(0 0 0 / 8%); }"
}`;

const HOOKS = [
  "agora-header", "agora-brand", "agora-logo", "agora-profile", "agora-creator-name", "agora-post", "agora-tier",
  "agora-card", "agora-button", "agora-button-secondary", "agora-input", "agora-link", "agora-like",
  "agora-comments-link", "agora-sidebar", "agora-footer",
];

export default async function AppearanceSettings({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser("CREATOR");
  const { notice, error } = await searchParams;
  const custom = customThemeName(user.themeSettings);
  const selected = custom ? "custom" : user.themeName;
  const settings = (user.themeSettings ?? {}) as Record<string, string>;

  // The colours the site uses right now: the chosen built-in palette, with any uploaded or saved overrides on top.
  const base = THEMES[isThemeName(user.themeName) ? user.themeName : "default"].palette;
  const colours = Object.fromEntries(
    COLOR_KEYS.map((key) => {
      const saved = settings[key];
      return [key, typeof saved === "string" && COLOR_PATTERN.test(saved) ? saved : base[key]];
    }),
  );
  const radius = typeof settings.radius === "string" && RADIUS_PATTERN.test(settings.radius) ? settings.radius : base.radius;

  return (
    <section className="space-y-6">
      <link rel="stylesheet" href={allFontsHref} precedence="default" />
      <h2 className="text-xl font-semibold">Appearance</h2>
      <Flash notice={notice} error={error} />

      <form action={saveAppearance} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="font-semibold">Theme</legend>
          {Object.entries(THEMES).map(([name, theme]) => (
            <label key={name} className="flex items-center gap-3 rounded-theme border border-line p-3">
              <input type="radio" name="theme" value={name} defaultChecked={selected === name} />
              <span className="flex gap-1">
                {(["primary", "secondary", "background", "text"] as const).map((key) => (
                  <span key={key} style={{ background: theme.palette[key] }} className="h-5 w-5 rounded-theme border border-black/20" />
                ))}
              </span>
              <span>
                <strong>{theme.label}</strong>
                <span className="block text-sm text-muted">{theme.description}</span>
              </span>
            </label>
          ))}
          {custom && (
            <label className="flex items-center gap-3 rounded-theme border border-line p-3">
              <input type="radio" name="theme" value="custom" defaultChecked />
              <span className="flex gap-1">
                {["primary", "secondary", "background", "text"].map((key) => (
                  <span key={key} style={{ background: settings[key] ?? "transparent" }} className="h-5 w-5 rounded-theme border border-black/20" />
                ))}
              </span>
              <span>
                <strong>{custom}</strong>
                <span className="block text-sm text-muted">Your own colours, radius or uploaded file.</span>
              </span>
            </label>
          )}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <FontSelect name="fontBody" label="Body font" defaultValue={user.fontBody ?? ""} />
          <FontSelect name="fontHeading" label="Heading font" defaultValue={user.fontHeading ?? ""} />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="showPoweredBy" defaultChecked={user.showPoweredBy} />
          Show &ldquo;Powered by Agora&rdquo; at the bottom of my page
        </label>
        <button className={buttonClass}>Save appearance</button>
      </form>

      <section className={`${cardClass} space-y-4 p-5`}>
        <div>
          <h3 className="font-semibold">Customise colours</h3>
          <p className="text-sm text-muted">Start from the theme above and tweak any colour. The preview updates as you pick.</p>
        </div>
        <ColourEditor initial={colours} initialRadius={radius} />
      </section>

      <div className="space-y-3">
        <h3 className="font-semibold">Upload a theme file</h3>
        <p className="text-sm text-muted">
          JSON, under 20 KB. Anything left out keeps the current theme&apos;s value.
        </p>
        <pre className="overflow-x-auto rounded-theme bg-secondary p-3 text-sm">{SAMPLE}</pre>
        <p className="text-sm text-muted">
          CSS hooks: {HOOKS.map((hook) => `.${hook}`).join(", ")}. CSS can&apos;t use url(), @import or @font-face.
        </p>
        <form action={uploadTheme} className="flex flex-wrap items-end gap-3">
          <label>
            Theme file
            <input name="themeFile" type="file" accept="application/json,.json" required className={inputClass} />
          </label>
          <button className={buttonClass}>Upload theme</button>
        </form>
        {custom && (
          <form action={removeTheme}>
            <button className="text-sm underline">Remove uploaded theme</button>
          </form>
        )}
      </div>
    </section>
  );
}
