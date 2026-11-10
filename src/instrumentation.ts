// Runs once when the server starts: it begins announcing scheduled posts and, in demo mode, seeds the
// fictional creator and schedules the periodic reset.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DEMO_MODE === "true") {
    const { startDemoLifecycle } = await import("@/lib/demo-lifecycle");
    startDemoLifecycle();
  }
  const { startPublisher } = await import("@/lib/publisher");
  startPublisher();
}
