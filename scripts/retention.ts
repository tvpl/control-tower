import { transientRetention } from "../src/server/application/operations";
console.log(
  JSON.stringify(await transientRetention(process.argv.includes("--apply"))),
);
process.exit(0);
