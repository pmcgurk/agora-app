import Logo from "@/components/Logo";

export default function PoweredBy() {
  return (
    <footer className="agora-footer flex items-center justify-center gap-1.5 px-4 py-8 text-sm text-muted">
      Powered by
      <a href="https://github.com/pmcgurk/agora" rel="noopener noreferrer">
        <Logo className="text-lg" />
      </a>
    </footer>
  );
}
