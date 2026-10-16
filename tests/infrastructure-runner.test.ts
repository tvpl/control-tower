import { describe, it, expect } from "vitest";
import { verifyInfrastructure } from "../scripts/verify-infrastructure.mjs";
type Call = { args: string[]; env: NodeJS.ProcessEnv };
function dockerFixture(
  fail?: (args: string[]) => boolean,
  foreignContainer = false,
) {
  const calls: Call[] = [],
    owners = new Map<string, string>();
  const execute = async (args: string[], env: NodeJS.ProcessEnv) => {
    calls.push({ args: [...args], env: { ...env } });
    if (args[0] === "version") {
      if (fail?.(args)) throw new Error("Fixture failure");
      return "28.0.0-fixture";
    }
    if (args[0] === "network" && args[1] === "create")
      owners.set(args.at(-1)!, args[args.indexOf("--label") + 1].split("=")[1]);
    if (args[0] === "run")
      owners.set(
        args[args.indexOf("--name") + 1],
        args[args.indexOf("--label") + 1].split("=")[1],
      );
    if (fail?.(args)) throw new Error("Fixture failure");
    if (
      args[0] === "inspect" ||
      (args[0] === "network" && args[1] === "inspect")
    ) {
      const name = args.at(-1)!;
      if (foreignContainer && name.endsWith("-web")) return "another-project";
      if (!owners.has(name)) throw new Error("Not found");
      return owners.get(name)!;
    }
    return "";
  };
  return { execute, calls };
}
describe("orquestração de QA isolado; não representa execução de Docker real", () => {
  it("motor ausente bloqueia sem criar containers ou fingir sucesso", async () => {
    const fixture = dockerFixture((args) => args[0] === "version");
    const report = await verifyInfrastructure({ ...fixture, log: () => {} });
    expect(report.status).toBe("BLOCKED");
    expect(report.checks).toEqual([]);
    expect(fixture.calls).toHaveLength(1);
  });
  it("não herda credenciais operacionais e não expõe secrets em argumentos ou relatório", async () => {
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      AUTH_SECRET: process.env.AUTH_SECRET,
      MCT_CONNECTOR_GITHUB_TOKEN: process.env.MCT_CONNECTOR_GITHUB_TOKEN,
    };
    process.env.DATABASE_URL = "postgres://company-secret@production/real";
    process.env.AUTH_SECRET = "corporate-secret";
    process.env.MCT_CONNECTOR_GITHUB_TOKEN = "connector-secret";
    const fixture = dockerFixture();
    try {
      const report = await verifyInfrastructure({ ...fixture, log: () => {} });
      expect(report.status).toBe("PASSED");
      expect(report.checks).toHaveLength(8);
      expect(report.cleanup).toBe("COMPLETE");
      const visible = JSON.stringify({
        report,
        args: fixture.calls.map((c) => c.args),
      });
      expect(visible).not.toMatch(
        /corporate-secret|company-secret|connector-secret|postgres:\/\//,
      );
      for (const { env } of fixture.calls) {
        expect(env.MCT_CONNECTOR_GITHUB_TOKEN).toBeUndefined();
        if (env.DATABASE_URL)
          expect(new URL(env.DATABASE_URL).hostname).toBe("db");
        if (env.AUTH_SECRET)
          expect(env.AUTH_SECRET).not.toBe("corporate-secret");
      }
      const runs = fixture.calls.filter((c) => c.args[0] === "run");
      expect(
        runs.every(
          (c) => !c.args.includes("-p") && !c.args.includes("--publish"),
        ),
      ).toBe(true);
      const web = runs.find(
        (c) =>
          c.args.includes("--network-alias") &&
          c.args[c.args.indexOf("--network-alias") + 1] === "web",
      )!;
      expect(new URL(web.env.DATABASE_URL!).username).toBe("mct_runtime");
      expect(web.env.ALLOW_LOCAL_PREVIEW).toBeUndefined();
      expect(web.env.AUTH_MODE).toBe("oidc");
      expect(runs.some((c) => c.args.includes("--tmpfs"))).toBe(true);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
  it("falha de restore falha o ensaio e ainda remove somente recursos próprios", async () => {
    const fixture = dockerFixture((args) => args.includes("backup-restore"));
    const report = await verifyInfrastructure({ ...fixture, log: () => {} });
    expect(report.status).toBe("FAILED");
    expect(report.phase).toBe("encrypted-backup-restore");
    expect(
      report.checks.some((c) => c.name === "encrypted-backup-restore"),
    ).toBe(false);
    expect(
      fixture.calls.some(
        (c) => c.args[0] === "rm" && c.args.at(-1)!.endsWith("-db"),
      ),
    ).toBe(true);
    expect(
      fixture.calls.some((c) => c.args[0] === "network" && c.args[1] === "rm"),
    ).toBe(true);
    expect(fixture.calls.some((c) => c.args.includes("prune"))).toBe(false);
  });
  it("não remove container cuja etiqueta pertença a outro projeto", async () => {
    const fixture = dockerFixture(undefined, true);
    const report = await verifyInfrastructure({ ...fixture, log: () => {} });
    expect(report.status).toBe("FAILED");
    expect(report.cleanup).toBe("INCOMPLETE");
    expect(
      fixture.calls.some(
        (c) => c.args[0] === "rm" && c.args.at(-1)!.endsWith("-web"),
      ),
    ).toBe(false);
  });
  it("interrupção encerra etapas e executa limpeza, sem status verde", async () => {
    const abort = new AbortController(),
      fixture = dockerFixture();
    const report = await verifyInfrastructure({
      ...fixture,
      signal: abort.signal,
      log: () => abort.abort(),
    });
    expect(report.status).toBe("INTERRUPTED");
    expect(report.checks).toEqual([]);
  });
  it("falha na limpeza da rede é reportada e impede aprovação", async () => {
    const fixture = dockerFixture(
      (args) => args[0] === "network" && args[1] === "rm",
    );
    const report = await verifyInfrastructure({ ...fixture, log: () => {} });
    expect(report.status).toBe("FAILED");
    expect(report.cleanup).toBe("INCOMPLETE");
  });
});
it("falha de inspeção durante limpeza não é confundida com recurso inexistente", async () => {
  const fixture = dockerFixture((args) => args[0] === "inspect");
  const report = await verifyInfrastructure({ ...fixture, log: () => {} });
  expect(report.status).toBe("FAILED");
  expect(report.cleanup).toBe("INCOMPLETE");
  expect(report.remainingResources?.length).toBeGreaterThan(0);
});
it("diagnóstico de erro remove credenciais de QA antes de persistir", async () => {
  const fixture = dockerFixture();
  const report = await verifyInfrastructure({
    log: () => {},
    execute: async (args, env) => {
      if (args.includes("backup-restore"))
        throw Object.assign(new Error("failure"), {
          stderr: `dump failed ${env.DATABASE_URL} ${env.AUTH_SECRET} ${env.MCT_BACKUP_KEY_HEX}`,
        });
      return fixture.execute(args, env);
    },
  });
  expect(report.status).toBe("FAILED");
  expect(report.diagnostic).toContain("[redacted]");
  expect(report.diagnostic).not.toMatch(/postgres:\/\/|[a-f0-9]{64}/i);
});
