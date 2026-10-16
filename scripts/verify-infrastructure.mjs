import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
/**
 * @typedef {{asOf:string,status:string,scope:string,checks:Array<{name:string,status:string}>,dockerVersion?:string,phase?:string,reason?:string,cleanup?:string,remainingResources?:string[],diagnostic?:string,runtimeDiagnostics?:Array<{service:string,output:string}>}} InfrastructureReport
 * @param {{execute?:(args:string[],env:NodeJS.ProcessEnv,timeout?:number,signal?:AbortSignal)=>Promise<string>,log?:(phase:string)=>void,signal?:AbortSignal}} options
 * @returns {Promise<InfrastructureReport>}
 */
export async function verifyInfrastructure({
  execute = async (args, env, timeout = 120000, requestSignal) => {
    const result = await exec("docker", args, {
      cwd: root,
      env,
      timeout,
      maxBuffer: 16 * 1024 * 1024,
      signal: requestSignal,
    });
    return args[0] === "logs"
      ? result.stdout + result.stderr
      : result.stdout.trim();
  },
  log = (phase) => console.log(JSON.stringify({ phase })),
  signal,
} = {}) {
  /** @type {InfrastructureReport} */
  const report = {
    asOf: new Date().toISOString(),
    status: "RUNNING",
    scope:
      "isolated local containers; synthetic data; no corporate homologation",
    checks: [],
  };
  // Never inherit operational DATABASE_URL, auth, connector or backup credentials.
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
  let phase = "docker-engine";
  try {
    const version = await execute(
      ["version", "--format", "{{.Server.Version}}"],
      env,
      15000,
    );
    if (!version) throw new Error("No engine");
    report.dockerVersion = version;
  } catch {
    return {
      ...report,
      status: "BLOCKED",
      phase,
      reason:
        "Motor Docker indisponível. Inicie o Docker e repita npm run test:infra; nenhum container foi criado.",
    };
  }
  const run = "mct-qa-" + randomUUID().replaceAll("-", "").slice(0, 16);
  const network = run + "-net";
  const owner = run + "-db",
    web = run + "-web",
    worker = run + "-worker";
  const images = {
    web: run + ":web",
    worker: run + ":worker",
    tools: run + ":tools",
  };
  const containers = [];
  const work = await mkdtemp(resolve(tmpdir(), "mct-infra-"));
  const secret = randomBytes(32).toString("hex");
  env.AUTH_SECRET = randomBytes(32).toString("hex");
  env.POSTGRES_PASSWORD = secret;
  env.POSTGRES_USER = "tower";
  env.POSTGRES_DB = "mct_qa";
  env.DATABASE_URL = `postgres://tower:${secret}@db:5432/mct_qa?sslmode=disable`;
  env.MCT_QA_RUNTIME_PASSWORD = randomBytes(32).toString("hex");
  env.MCT_QA_RUNTIME_URL = `postgres://mct_runtime:${env.MCT_QA_RUNTIME_PASSWORD}@db:5432/mct_qa?sslmode=disable`;
  env.RESTORE_DATABASE_URL = `postgres://tower:${secret}@db:5432/mct_qa_restore?sslmode=disable`;
  env.MCT_BACKUP_KEY_HEX = randomBytes(32).toString("hex");
  env.AUTH_MODE = "oidc";
  env.APP_ORIGIN = "http://web:3000";
  const command = async (args, timeout) => {
    if (signal?.aborted) throw new Error("Interrupted");
    return execute(args, env, timeout, signal);
  };
  const step = async (name, action) => {
    phase = name;
    log(name);
    await action();
    report.checks.push({ name, status: "PASSED" });
  };
  const namedRun = (name, image, options = [], args = []) => {
    containers.push(name);
    return command([
      "run",
      "--name",
      name,
      "--label",
      `mct.qa.run=${run}`,
      "--network",
      network,
      ...options,
      image,
      ...args,
    ]);
  };
  let seq = 0;
  let networkCreated = false;
  const tools = (action, args = []) =>
    namedRun(
      run + "-task-" + ++seq,
      images.tools,
      [
        "--rm",
        "--mount",
        `type=bind,src=${work},dst=/qa-output`,
        ...[
          "DATABASE_URL",
          "AUTH_SECRET",
          "AUTH_MODE",
          "APP_ORIGIN",
          "MCT_QA_RUNTIME_PASSWORD",
          "MCT_QA_RUNTIME_URL",
          "RESTORE_DATABASE_URL",
          "MCT_BACKUP_KEY_HEX",
        ].flatMap((key) => ["--env", key]),
      ],
      action === "migrate"
        ? ["npm", "run", "db:migrate"]
        : [
            "node",
            "--import",
            "tsx",
            "scripts/verify-postgres.ts",
            action,
            ...args,
          ],
    );
  try {
    await step("build-images", async () => {
      for (const target of ["web", "worker", "infra-check"])
        await command(
          [
            "build",
            "--target",
            target,
            "--tag",
            target === "infra-check" ? images.tools : images[target],
            ".",
          ],
          600000,
        );
    });
    await step("isolated-postgres", async () => {
      await command([
        "network",
        "create",
        "--label",
        `mct.qa.run=${run}`,
        network,
      ]);
      networkCreated = true;
      await namedRun(owner, "postgres:16-alpine", [
        "-d",
        "--network-alias",
        "db",
        "--tmpfs",
        "/var/lib/postgresql/data:rw,size=536870912",
        ...["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"].flatMap(
          (key) => ["--env", key],
        ),
      ]);
      let ready = false;
      for (let i = 0; i < 45; i++) {
        try {
          await command(
            ["exec", owner, "pg_isready", "-U", "tower", "-d", "mct_qa"],
            10000,
          );
          ready = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (!ready) throw new Error("PostgreSQL not ready");
    });
    await step("concurrent-migrations", async () => {
      // Always await both processes before cleanup, including when one rejects.
      const runs = await Promise.allSettled([
        tools("migrate"),
        tools("migrate"),
      ]);
      if (runs.some((result) => result.status === "rejected"))
        throw runs.find((result) => result.status === "rejected").reason;
    });
    await step("fixtures-and-runtime-grants", () => tools("prepare"));
    await step("web-without-worker", async () => {
      const runtimeEnv = { ...env, DATABASE_URL: env.MCT_QA_RUNTIME_URL };
      containers.push(web);
      await execute(
        [
          "run",
          "-d",
          "--name",
          web,
          "--label",
          `mct.qa.run=${run}`,
          "--network",
          network,
          "--network-alias",
          "web",
          ...["DATABASE_URL", "AUTH_SECRET", "AUTH_MODE", "APP_ORIGIN"].flatMap(
            (key) => ["--env", key],
          ),
          images.web,
        ],
        runtimeEnv,
        120000,
        signal,
      );
      await tools("before-worker");
    });
    await step("separate-worker-and-jobs", async () => {
      containers.push(worker);
      await execute(
        [
          "run",
          "-d",
          "--name",
          worker,
          "--label",
          `mct.qa.run=${run}`,
          "--network",
          network,
          "--env",
          "DATABASE_URL",
          "--env",
          "AUTH_SECRET",
          images.worker,
        ],
        { ...env, DATABASE_URL: env.MCT_QA_RUNTIME_URL },
        120000,
        signal,
      );
      await tools("after-worker");
    });
    await step("encrypted-backup-restore", () => tools("backup-restore"));
    await step("worker-stop-readiness", async () => {
      await command(["stop", "--time", "20", worker]);
      await tools("after-stop");
    });
    report.status = "PASSED";
  } catch (error) {
    report.status = signal?.aborted ? "INTERRUPTED" : "FAILED";
    const sanitize = (value) => {
      let output = String(value);
      for (const key of [
        "AUTH_SECRET",
        "POSTGRES_PASSWORD",
        "DATABASE_URL",
        "MCT_QA_RUNTIME_PASSWORD",
        "MCT_QA_RUNTIME_URL",
        "RESTORE_DATABASE_URL",
        "MCT_BACKUP_KEY_HEX",
      ])
        if (env[key]) output = output.replaceAll(env[key], "[redacted]");
      return output
        .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[database]")
        .replace(/[a-f0-9]{64}/gi, "[digest]")
        .slice(-2000);
    };
    report.diagnostic = sanitize(
      error?.stderr || error?.message || "Falha sem detalhes",
    );
    report.runtimeDiagnostics = [];
    for (const [service, name] of [
      ["web", web],
      ["worker", worker],
      ["postgres", owner],
    ]) {
      try {
        const label = await execute(
          [
            "inspect",
            "--format",
            '{{ index .Config.Labels "mct.qa.run" }}',
            name,
          ],
          env,
          10000,
        );
        if (label === run)
          report.runtimeDiagnostics.push({
            service,
            output: sanitize(
              await execute(["logs", "--tail", "30", name], env, 10000),
            ),
          });
      } catch {
        /* Missing or inaccessible diagnostic never replaces the original failure. */
      }
    }
    report.phase = phase;
    report.reason =
      "Etapa não concluída. Não houve homologação externa nem alteração na base operacional.";
  } finally {
    const failures = [];
    // Inspect labels first: a name alone never authorizes removing an unrelated resource.
    for (const name of containers.reverse()) {
      let label;
      try {
        label = await execute(
          [
            "inspect",
            "--format",
            '{{ index .Config.Labels "mct.qa.run" }}',
            name,
          ],
          env,
          10000,
        );
      } catch (error) {
        // Only an explicit not-found response proves that no resource remains.
        if (
          !/no such (object|container)|not found/i.test(
            String(error?.stderr || error?.message || ""),
          )
        )
          failures.push(name);
        continue;
      }
      if (label !== run) {
        failures.push(name);
        continue;
      }
      try {
        await execute(["rm", "--force", "--volumes", name], env, 30000);
      } catch {
        failures.push(name);
      }
    }
    try {
      const label = await execute(
        [
          "network",
          "inspect",
          "--format",
          '{{ index .Labels "mct.qa.run" }}',
          network,
        ],
        env,
        10000,
      );
      if (label === run) await execute(["network", "rm", network], env, 10000);
      else failures.push(network);
    } catch {
      if (networkCreated) failures.push(network);
    }
    // Remove only the unique tags created for this invocation; keep shared build cache.
    for (const image of Object.values(images))
      await execute(["image", "rm", image], env, 30000).catch(() => {});
    await rm(work, { recursive: true, force: true });
    report.cleanup = failures.length ? "INCOMPLETE" : "COMPLETE";
    if (failures.length) {
      report.status = "FAILED";
      report.remainingResources = failures;
    }
  }
  return report;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const abort = new AbortController();
  process.once("SIGINT", () => abort.abort());
  process.once("SIGTERM", () => abort.abort());
  const report = await verifyInfrastructure({ signal: abort.signal });
  const output = resolve(
    root,
    "docs/implementation/infrastructure-verification.json",
  );
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  process.exitCode =
    report.status === "PASSED" ? 0 : report.status === "BLOCKED" ? 2 : 1;
}
