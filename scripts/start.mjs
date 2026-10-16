import nextEnv from "@next/env";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = process.cwd();
nextEnv.loadEnvConfig(root, false);
process.env.HOSTNAME = process.env.MCT_HOSTNAME || "127.0.0.1";
process.env.PGLITE_DATA_DIR = path.resolve(
  root,
  process.env.PGLITE_DATA_DIR || "data/control-tower",
);
await import(pathToFileURL(path.join(root, ".next/standalone/server.js")).href);
