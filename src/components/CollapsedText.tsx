"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { linkClass } from "@/components/ui";

// Long post text is clipped with a fade and a link to the full post. Short posts (and posts whose
// text is followed by a video or image) show everything.
const MAX_HEIGHT = 480;
const SLACK = 80;

export default function CollapsedText({ children, href }: { children: ReactNode; href: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const el = box.current;
    const inner = el?.firstElementChild;
    if (!el || !inner) return;
    const measure = () => setClipped(inner.scrollHeight > MAX_HEIGHT + SLACK);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  const fade = "linear-gradient(to bottom, black calc(100% - 96px), transparent)";
  return (
    <div className="mt-2">
      <div
        ref={box}
        style={clipped ? { maxHeight: MAX_HEIGHT, overflow: "hidden", maskImage: fade, WebkitMaskImage: fade } : undefined}
      >
        <div>{children}</div>
      </div>
      {clipped && (
        <p className="mt-1">
          <Link href={href} className={linkClass}>View full post →</Link>
        </p>
      )}
    </div>
  );
}
