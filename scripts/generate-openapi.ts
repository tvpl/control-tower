import { writeFile, copyFile, access } from "node:fs/promises";
import { buildOpenAPI } from "../src/server/domain/openapi";
try {
  await access("docs/05-api/openapi.original-draft.yaml");
} catch {
  await copyFile(
    "docs/05-api/openapi.yaml",
    "docs/05-api/openapi.original-draft.yaml",
  );
}
const text = JSON.stringify(buildOpenAPI(), null, 2) + "\n";
await writeFile("docs/05-api/openapi.yaml", text);
await writeFile("public/openapi.json", text);
console.log(
  "OpenAPI 3.1 gerada dos schemas em YAML 1.2 (notação JSON) e public/openapi.json.",
);
