"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { loadMorePosts } from "@/app/actions/feed";
import { secondaryButtonClass } from "@/components/ui";

// Appends the next batch of posts when the end of the list scrolls into view. The button is the
// fallback for browsers without IntersectionObserver and for anyone who prefers to click.
export default function InfinitePosts({ creatorId, q, initialCursor }: { creatorId: string; q: string; initialCursor: string }) {
  const [batches, setBatches] = useState<ReactNode[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const more = useCallback(async () => {
    if (busy.current || !cursor) return;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const result = await loadMorePosts(creatorId, q, cursor);
      setBatches((current) => [...current, result.cards]);
      setCursor(result.next);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [creatorId, q, cursor]);

  useEffect(() => {
    const el = end.current;
    if (!el || !cursor || failed || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void more(), { rootMargin: "600px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, failed, more]);

  return (
    <>
      {batches.map((batch, index) => (
        <div key={index} className="space-y-4">{batch}</div>
      ))}
      {cursor && (
        <div ref={end} className="py-2 text-center">
          <button type="button" onClick={() => void more()} disabled={loading} className={secondaryButtonClass}>
            {loading ? "Loading…" : failed ? "Couldn't load more. Try again" : "Load more posts"}
          </button>
        </div>
      )}
    </>
  );
}
