"use client";

// A date and time shown in the visitor's own time zone. The server only knows UTC, so it sends the
// exact moment and the browser formats it.
export default function LocalDateTime({ value }: { value: string }) {
  const date = new Date(value);
  return (
    <time dateTime={value} suppressHydrationWarning>
      {date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}
