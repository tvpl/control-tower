import { cp, access } from "node:fs/promises";
import path from "node:path";
const root = process.cwd(),
  out = path.join(root, ".next/standalone");
for (const forbidden of ["data", ".env", ".env.local", ".env.production"]) {
  try {
    await access(path.join(out, forbidden));
  } catch {
    continue;
  }
  throw new Error(
    `Artefato contém arquivo de runtime que não pode ser publicado: ${forbidden}`,
  );
}
await cp(path.join(root, ".next/static"), path.join(out, ".next/static"), {
  recursive: true,
});
await cp(path.join(root, "public"), path.join(out, "public"), {
  recursive: true,
});
console.log("Standalone empacotado com assets; dados e secrets excluídos.");
