import nextEnv from "@next/env";
import { getDb } from "../src/server/infrastructure/database";
import { migrate } from "../src/server/infrastructure/migrations";
nextEnv.loadEnvConfig(process.cwd());
await migrate(getDb());
process.exit(0);
