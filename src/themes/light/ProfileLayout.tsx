import type { ReactNode } from "react";

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <main className="agora-profile mx-auto my-8 max-w-2xl space-y-6 rounded-theme border border-line bg-surface px-6 py-8 shadow-sm">
      {children}
    </main>
  );
}
