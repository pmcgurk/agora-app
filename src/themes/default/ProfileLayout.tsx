import type { ReactNode } from "react";

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return <main className="agora-profile mx-auto max-w-2xl space-y-6 px-4 py-10">{children}</main>;
}
