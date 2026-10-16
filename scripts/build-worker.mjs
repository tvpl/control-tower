import { build } from "esbuild";
await build({
  entryPoints: ["scripts/worker.ts"],
  outfile: "dist/worker.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  sourcemap: true,
});
console.log("Worker empacotado em dist/worker.mjs.");
