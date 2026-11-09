import { demoResetMinutes } from "./demo";
import { resetDemoData } from "./demo-data";
import { prisma } from "./prisma";

// Keeps a demo instance fresh: seeds it when the server starts, then wipes and re-seeds it on a
// timer so whatever visitors did is gone within the hour. The waitlist is never touched.

const state = globalThis as { __agoraDemoTimer?: NodeJS.Timeout; __agoraDemoRunning?: boolean };

async function reset(reason: string) {
  if (state.__agoraDemoRunning) return;
  state.__agoraDemoRunning = true;
  try {
    await resetDemoData(prisma);
    console.log(`Demo data reset (${reason}).`);
  } catch (error) {
    console.error("Demo reset failed:", error instanceof Error ? error.message : error);
  } finally {
    state.__agoraDemoRunning = false;
  }
}

export function startDemoLifecycle() {
  if (state.__agoraDemoTimer) return;
  void reset("startup");
  state.__agoraDemoTimer = setInterval(() => void reset("scheduled"), demoResetMinutes() * 60_000);
  state.__agoraDemoTimer.unref();
}
