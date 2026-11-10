import type { ReactNode } from "react";

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    // On wider screens the column is a finished panel (all four edges, rounded) instead of two lines that
    // just stop where the content does. On a phone it simply fills the width.
    <main className="agora-profile mx-auto max-w-3xl space-y-6 px-6 py-10 sm:my-8 sm:rounded-theme sm:border sm:border-line">
      {children}
    </main>
  );
}
