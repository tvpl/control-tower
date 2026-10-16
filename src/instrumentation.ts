export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    !(
      process.env.NODE_ENV === "development" ||
      process.env.ALLOW_LOCAL_PREVIEW === "true"
    )
  )
    return;
  const global = globalThis as typeof globalThis & {
    mctJobTimer?: ReturnType<typeof setInterval>;
  };
  if (global.mctJobTimer) return;
  const { processNextJob } = await import("./server/application/jobs"),
    { enqueueDueSyncs } = await import("./server/application/sync-worker");
  const { publishOutbox } = await import("./server/application/notifications");
  const { workerHeartbeat } = await import("./server/application/operations");
  let busy = false;
  global.mctJobTimer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await enqueueDueSyncs();
      await processNextJob();
      await publishOutbox();
      await workerHeartbeat("embedded-preview", "RUNNING");
    } catch {
      console.error(JSON.stringify({ event: "worker.tick_failed" }));
    } finally {
      busy = false;
    }
  }, 5000);
  global.mctJobTimer.unref();
}
