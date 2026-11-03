import "@fontsource-variable/fraunces";

export default function Logo({ className = "text-2xl" }: { className?: string }) {
  return (
    <span
      className={`agora-logo ${className}`}
      style={{ fontFamily: "'Fraunces Variable', Georgia, serif", fontWeight: 800, letterSpacing: "-0.03em", color: "#6d28d9" }}
    >
      Agora
    </span>
  );
}
