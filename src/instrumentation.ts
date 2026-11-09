// Runs once when the server starts. In demo mode it seeds the fictional creator and schedules the
// periodic reset; on a normal instance it does nothing.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DEMO_MODE !== "true") return;
  const { startDemoLifecycle } = await import("@/lib/demo-lifecycle");
  startDemoLifecycle();
}
