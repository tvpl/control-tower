import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
const action = process.argv[2] || "start";
if (!["start", "stop"].includes(action))
  throw new Error("Use npm run docker:local ou npm run docker:stop.");
const dir = resolve(root, "data/docker-local"),
  envfile = resolve(dir, "runtime.env");
await mkdir(dir, { recursive: true, mode: 0o700 });
await chmod(dir, 0o700);
try {
  await readFile(envfile);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  if (action === "stop")
    throw new Error("Ambiente Docker local ainda não foi configurado.");
  await writeFile(
    envfile,
    `POSTGRES_PASSWORD=${randomBytes(32).toString("hex")}\nAUTH_SECRET=${randomBytes(32).toString("hex")}\nAPP_ORIGIN=http://127.0.0.1:3000\n`,
    { flag: "wx", mode: 0o600 },
  );
}
await chmod(envfile, 0o600);
const compose = [
  "compose",
  "--project-name",
  "mct-local",
  "--env-file",
  envfile,
  "-f",
  "compose.yaml",
  "-f",
  "compose.local.yaml",
];
// Opt-in operator configuration, downloaded from the GitLab guide. Never baked into images.
try {
  await readFile(resolve(root, "compose.gitlab.yaml"));
  compose.push("-f", "compose.gitlab.yaml");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
// Explicit interpolation file only; ignore business credentials and connector values from the shell.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    [
      "PATH",
      "HOME",
      "DOCKER_HOST",
      "DOCKER_CONTEXT",
      "DOCKER_CONFIG",
      "DOCKER_TLS_VERIFY",
      "DOCKER_CERT_PATH",
      "TMPDIR",
      "SYSTEMROOT",
    ].includes(key),
  ),
);
async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn("docker", [...compose, ...args], {
      cwd: root,
      env,
      stdio: "inherit",
    });
    child.once("error", () =>
      reject(new Error("Docker indisponível. Inicie o Docker Desktop.")),
    );
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              "Docker retornou erro; confira a etapa acima. Nenhum volume é apagado automaticamente.",
            ),
          ),
    );
  });
}
if (action === "stop") {
  await run(["down"]);
  console.log("Aplicação parada. Volume PostgreSQL preservado.");
} else {
  console.log("Construindo web, worker e ferramentas dentro do Docker...");
  await run(["build", "migrate", "web", "worker"]);
  await run(["up", "-d", "--wait", "db"]);
  console.log(
    "Aplicando migrations e preparando dados fictícios; inventário existente é preservado.",
  );
  await run(["run", "--rm", "migrate", "npm", "run", "db:setup"]);
  await run(["up", "-d"]);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const r = await fetch("http://127.0.0.1:3000/api/health/ready", {
        signal: AbortSignal.timeout(3000),
      });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready)
    throw new Error(
      "Aplicação não ficou pronta. Consulte docker compose com os mesmos arquivos e envfile; o volume foi preservado.",
    );
  console.log(
    "Modernization Control Tower: http://127.0.0.1:3000\nDados fictícios: admin@demo.local / Tower-Demo-2026!\nPara parar sem apagar dados: npm run docker:stop",
  );
}
