"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { countNewPosts } from "@/app/actions/feed";
import { buttonClass } from "@/components/ui";

const POLL_MS = 30_000;

// Checks every 30 seconds (only while the tab is visible) for posts newer than the page's newest,
// and offers to show them. It never moves the page on its own, so nobody loses their place.
export default function NewPostsBanner({ creatorId, since }: { creatorId: string; since: string }) {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const found = await countNewPosts(creatorId, since);
        if (!stopped) setCount(found);
      } catch {
        // A failed check is not worth bothering anyone about; the next one tries again.
      }
    };
    const timer = setInterval(check, POLL_MS);
    const onVisible = () => !document.hidden && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [creatorId, since]);

  if (count === 0) return null;
  return (
    <div className="sticky top-2 z-10 flex justify-center">
      <button
        type="button"
        className={`${buttonClass} shadow-lg`}
        onClick={() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
          router.refresh();
        }}
      >
        {count === 1 ? "Load 1 new post" : `Load ${count} new posts`}
      </button>
    </div>
  );
}
