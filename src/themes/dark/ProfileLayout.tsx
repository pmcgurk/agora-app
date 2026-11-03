import type { ReactNode } from "react";

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <main className="agora-profile mx-auto max-w-3xl space-y-6 border-x border-line px-6 py-10">{children}</main>
  );
}
