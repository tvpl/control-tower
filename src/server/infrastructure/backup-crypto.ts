import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
const MAGIC = Buffer.from("MCTBKP001"),
  HEADER = 37;
export function backupKey(value: string | undefined) {
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new Error(
      "MCT_BACKUP_KEY_HEX deve conter chave aleatória de 32 bytes em hexadecimal.",
    );
  return Buffer.from(value, "hex");
}
export async function encryptBackup(
  source: Readable,
  filename: string,
  key: Buffer,
) {
  if (key.length !== 32) throw new Error("Chave de backup inválida.");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const file = await open(filename, "wx", 0o600);
  try {
    await file.write(
      Buffer.concat([MAGIC, iv, Buffer.alloc(16)]),
      0,
      HEADER,
      0,
    );
    await pipeline(
      source,
      cipher,
      createWriteStream(filename, {
        fd: file.fd,
        start: HEADER,
        autoClose: false,
      }),
    );
    await file.write(cipher.getAuthTag(), 0, 16, 21);
    await file.sync();
  } catch (error) {
    await file.close();
    await unlink(filename);
    throw error;
  }
  await file.close();
}
export async function backupDecipher(filename: string, key: Buffer) {
  const f = await open(filename, "r");
  try {
    const header = Buffer.alloc(HEADER);
    const result = await f.read(header, 0, HEADER, 0);
    if (result.bytesRead !== HEADER || !header.subarray(0, 9).equals(MAGIC))
      throw new Error("Formato de backup inválido.");
    const cipher = createDecipheriv("aes-256-gcm", key, header.subarray(9, 21));
    cipher.setAAD(MAGIC);
    cipher.setAuthTag(header.subarray(21, 37));
    return cipher;
  } finally {
    await f.close();
  }
}
export async function verifyBackup(filename: string, key: Buffer) {
  const cipher = await backupDecipher(filename, key);
  await pipeline(
    createReadStream(filename, { start: HEADER }),
    cipher,
    new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    }),
  );
}
export function backupSource(filename: string) {
  return createReadStream(filename, { start: HEADER });
}
