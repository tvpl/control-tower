import { randomUUID } from "node:crypto";
import { processNextJob } from "../src/server/application/jobs";
import { enqueueDueSyncs } from "../src/server/application/sync-worker";
import { publishOutbox } from "../src/server/application/notifications";
import {
  workerHeartbeat,
  transientRetention,
} from "../src/server/application/operations";
if (!process.env.DATABASE_URL)
  throw new Error(
    "Worker separado exige PostgreSQL servidor (DATABASE_URL); PGlite não aceita processos concorrentes.",
  );
const id = process.env.MCT_WORKER_ID || `worker-${randomUUID()}`;
let stopping = false,
  heartbeatStatus = "RUNNING";
const heartbeatTimer = setInterval(() => {
  workerHeartbeat(id, heartbeatStatus).catch(() => {});
}, 10000);
heartbeatTimer.unref();
process.once("SIGINT", () => {
  stopping = true;
});
process.once("SIGTERM", () => {
  stopping = true;
});
let maintenance = 0;
while (!stopping) {
  try {
    heartbeatStatus = "RUNNING";
    await enqueueDueSyncs();
    const result = await processNextJob();
    const outbox = await publishOutbox();
    await workerHeartbeat(id, "RUNNING", {
      jobProcessed: !!result,
      published: outbox.published,
    });
    if (Date.now() - maintenance > 86400000) {
      if (process.env.MCT_RETENTION_ENABLED === "true")
        await transientRetention(true);
      maintenance = Date.now();
    }
    if (process.argv.includes("--once")) break;
    if (!result) await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    heartbeatStatus = "ERROR";
    console.error(
      JSON.stringify({
        event: "worker.tick_failed",
        errorClass: (error as Error).name,
      }),
    );
    await workerHeartbeat(id, "ERROR").catch(() => {});
    if (process.argv.includes("--once")) {
      process.exitCode = 1;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
clearInterval(heartbeatTimer);
await workerHeartbeat(id, "STOPPED");
process.exit(process.exitCode || 0);
