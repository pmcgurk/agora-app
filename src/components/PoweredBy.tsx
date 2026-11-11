import Logo from "@/components/Logo";
import { versionLabel } from "@/lib/version";

export default function PoweredBy() {
  return (
    <footer className="agora-footer flex items-center justify-center gap-1.5 px-4 py-8 text-sm text-muted">
      Powered by
      <a href="https://github.com/pmcgurk/agora-app" rel="noopener noreferrer">
        <Logo className="text-lg" />
      </a>
      {/* For debugging: which build is this site running? */}
      <span className="agora-version text-xs opacity-70" title="Agora version">{versionLabel()}</span>
    </footer>
  );
}
