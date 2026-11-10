import { announceDuePosts } from "./publishing";

// Scheduled posts go live on their own: visitors only see posts whose time has passed. This timer
// is what tells subscribers about them, within a minute of their time.
const state = globalThis as { __agoraPublisher?: NodeJS.Timeout };

async function tick() {
  try {
    await announceDuePosts();
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
