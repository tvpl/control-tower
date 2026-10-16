import { it, expect } from "vitest";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  backupKey,
  encryptBackup,
  backupDecipher,
  backupSource,
  verifyBackup,
} from "../src/server/infrastructure/backup-crypto";
it("backup criptografado verifica integridade e chave antes do restore; destino existente é preservado", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "mct-backup-")),
    file = path.join(dir, "test.mct"),
    key = randomBytes(32),
    payload = Buffer.from("PGDMP conteúdo sintético de teste ".repeat(100));
  try {
    expect(() => backupKey(undefined)).toThrow(/chave/);
    await encryptBackup(Readable.from(payload), file, key);
    expect((await readFile(file)).includes(payload)).toBe(false);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await verifyBackup(file, key);
    await expect(verifyBackup(file, randomBytes(32))).rejects.toThrow();
    const output: Buffer[] = [];
    await pipeline(
      backupSource(file),
      await backupDecipher(file, key),
      new Writable({
        write(chunk, _encoding, done) {
          output.push(Buffer.from(chunk));
          done();
        },
      }),
    );
    expect(Buffer.concat(output)).toEqual(payload);
    await expect(
      encryptBackup(Readable.from("overwrite"), file, key),
    ).rejects.toThrow();
    await verifyBackup(file, key);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
