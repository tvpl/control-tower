import { it, expect } from "vitest";
import { build } from "esbuild";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
it("worker ESM inicia sem carregar contexto HTTP do Next e exige PostgreSQL servidor", async () => {
  await mkdir("dist", { recursive: true });
  const dir = await mkdtemp(path.join(process.cwd(), "dist/worker-qa-"));
  try {
    const file = path.join(dir, "worker.mjs");
    await build({
      entryPoints: ["scripts/worker.ts"],
      outfile: file,
      bundle: true,
      platform: "node",
      target: "node22",
      format: "esm",
      packages: "external",
    });
    const result = await promisify(execFile)(
      process.execPath,
      [file, "--once"],
      {
        env: { ...process.env, DATABASE_URL: "", NODE_ENV: "production" },
        timeout: 10000,
      },
    ).catch((error) => error);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "Worker separado exige PostgreSQL servidor",
    );
    expect(result.stderr).not.toMatch(
      /ERR_MODULE_NOT_FOUND|Cannot find module/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
