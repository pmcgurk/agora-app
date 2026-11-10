import { cleanExpired } from "./housekeeping";
import { sendQueuedPostEmails } from "./post-emails";
import { announceDuePosts } from "./publishing";

// Runs every minute inside the server. It tells subscribers about scheduled posts as their time comes and does
// the hourly housekeeping.
// Scheduled posts go live on their own: visitors only see posts whose time has passed. This timer
// is what tells subscribers about them, within a minute of their time.
const state = globalThis as { __agoraPublisher?: NodeJS.Timeout };

// Once a minute unless told otherwise. The browser tests set PUBLISHER_INTERVAL_SECONDS so they need not wait.
const INTERVAL_MS = Math.max(1, Number(process.env.PUBLISHER_INTERVAL_SECONDS) || 60) * 1000;
const TICKS_PER_HOUR = Math.max(1, Math.round((60 * 60 * 1000) / INTERVAL_MS));
let ticks = 0;

async function tick() {
  try {
    await announceDuePosts();
    await sendQueuedPostEmails();
    // Once an hour, throw away sessions and email links that can never be used again.
    if (ticks++ % TICKS_PER_HOUR === 0) await cleanExpired();
  } catch (error) {
    console.error("Announcing scheduled posts failed:", error instanceof Error ? error.message : error);
  }
}

export function startPublisher() {
  if (state.__agoraPublisher) return;
  void tick();
  state.__agoraPublisher = setInterval(() => void tick(), INTERVAL_MS);
  state.__agoraPublisher.unref();
}
