import { cleanExpired } from "./housekeeping";
import { announceDuePosts } from "./publishing";

// Runs every minute inside the server. It tells subscribers about scheduled posts as their time comes and does
// the hourly housekeeping.
// Scheduled posts go live on their own: visitors only see posts whose time has passed. This timer
// is what tells subscribers about them, within a minute of their time.
const state = globalThis as { __agoraPublisher?: NodeJS.Timeout };

let ticks = 0;

async function tick() {
  try {
    await announceDuePosts();
    // Once an hour, throw away sessions and email links that can never be used again.
    if (ticks++ % 60 === 0) await cleanExpired();
  } catch (error) {
    console.error("Announcing scheduled posts failed:", error instanceof Error ? error.message : error);
  }
}

export function startPublisher() {
  if (state.__agoraPublisher) return;
  void tick();
  state.__agoraPublisher = setInterval(() => void tick(), 60_000);
  state.__agoraPublisher.unref();
}
