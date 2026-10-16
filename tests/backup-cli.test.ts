import { it, expect } from "vitest";
import {
  mkdtemp,
  writeFile,
  readFile,
  stat,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { verifyBackup } from "../src/server/infrastructure/backup-crypto";
const exec = promisify(execFile);
async function fixture(code: number) {
  const dir = await mkdtemp(path.join(tmpdir(), "mct-backup-cli-")),
    file = path.join(dir, "qa.mct"),
    key = randomBytes(32);
  await writeFile(
    path.join(dir, "pg_dump"),
    `#!${process.execPath}\nprocess.stdout.write('PGDMP-only-synthetic-cli-fixture');process.exitCode=${code};\n`,
    { mode: 0o700 },
  );
  const run = () =>
    exec(process.execPath, ["--import", "tsx", "scripts/pg-backup.ts", file], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: dir + path.delimiter + process.env.PATH,
        DATABASE_URL: "postgres://synthetic:never-print-password@db/mct_qa",
        MCT_BACKUP_KEY_HEX: key.toString("hex"),
      },
      timeout: 15000,
    });
  return { dir, file, key, run };
}
it("dump incompleto e código não zero não deixam archive ou sidecar utilizável", async () => {
  const f = await fixture(3);
  try {
    const failure = await f.run().catch((error) => error);
    expect(failure.code).toBe(1);
    expect(failure.stderr).not.toContain("never-print-password");
    await expect(access(f.file)).rejects.toThrow();
    await expect(access(f.file + ".json")).rejects.toThrow();
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
it("CLI só anuncia archive cifrado após sucesso e registra hash/permissões", async () => {
  const f = await fixture(0);
  try {
    const result = await f.run();
    expect(JSON.parse(result.stdout).status).toBe("ENCRYPTED");
    const bytes = await readFile(f.file),
      meta = JSON.parse(await readFile(f.file + ".json", "utf8"));
    expect(bytes.includes(Buffer.from("only-synthetic-cli-fixture"))).toBe(
      false,
    );
    expect(meta.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect((await stat(f.file)).mode & 0o777).toBe(0o600);
    expect((await stat(f.file + ".json")).mode & 0o777).toBe(0o600);
    await verifyBackup(f.file, f.key);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
it("arquivo já existente é preservado mesmo ao abortar o processo de dump", async () => {
  const f = await fixture(0);
  try {
    await writeFile(f.file, "preservar", { mode: 0o600 });
    await expect(f.run()).rejects.toThrow();
    expect(await readFile(f.file, "utf8")).toBe("preservar");
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
it("sidecar preexistente é preservado e archive desta tentativa é removido", async () => {
  const f = await fixture(0);
  try {
    await writeFile(f.file + ".json", "metadado anterior", { mode: 0o600 });
    await expect(f.run()).rejects.toThrow();
    expect(await readFile(f.file + ".json", "utf8")).toBe("metadado anterior");
    await expect(access(f.file)).rejects.toThrow();
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
