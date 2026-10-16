import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DomainError, readiness } from "../domain/rules";
import { applicability, contextualAssessment } from "../domain/applicability";
import { effectiveAssessments } from "../domain/readiness";
import { memberships } from "../infrastructure/auth";
import type { Database, Row } from "../infrastructure/database";
import { audit, idempotent } from "./transactions";
import {
  catalogSchemas as schemas,
  catalogCode as code,
} from "../domain/catalog-schemas";
export { applicabilityRule } from "../domain/catalog-schemas";
const tables = {
  layers: "portfolio.layers",
  gates: "governance.gate_definitions",
  profiles: "governance.dod_profiles",
};
export async function saveCatalog(
  userId: string,
  pid: string,
  kind: keyof typeof schemas,
  id: string | undefined,
  input: unknown,
  key: string,
) {
  const data = schemas[kind]
    .extend({
      reason: z.string().trim().min(3).max(2000),
      expectedVersion: z.number().int().nonnegative(),
    })
    .strict()
    .parse(input) as Row;
  if (id && kind !== "layers") z.uuid().parse(id);
  if (id && kind === "layers") code.parse(id);
  return idempotent(
    userId,
    key,
    { op: "catalog", pid, kind, id, data },
    async (tx) => {
      await tx.query(
        "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
        [pid],
      );
      const roles = await memberships(userId, pid, tx);
      if (
        !roles.some((r) =>
          ["PROGRAM_ADMIN", "CHIEF_ARCHITECT"].includes(r.role),
        )
      )
        throw new DomainError(
          403,
          "Catálogos exigem administrador ou arquiteto.",
        );
      const [before] = id
        ? await tx.query(
            `SELECT * FROM ${tables[kind]} WHERE program_id=$1 AND ${kind === "layers" ? "code" : "id"}=$2 FOR UPDATE`,
            [pid, id],
          )
        : [];
      if (id && !before)
        throw new DomainError(
          404,
          "Catálogo não encontrado ou definição global somente leitura.",
        );
      if (Number(before?.version || 0) !== data.expectedVersion)
        throw new DomainError(409, "Catálogo alterado. Recarregue.");
      if (before && before.code !== data.code)
        throw new DomainError(422, "Código é imutável; crie outra definição.");
      for (const ws of (data.rule || data.applicability_rule)?.workstream_ids ||
        [])
        if (
          !(
            await tx.query(
              "SELECT id FROM portfolio.workstreams WHERE id=$1 AND program_id=$2",
              [ws, pid],
            )
          ).length
        )
          throw new DomainError(422, "Frente não pertence ao programa.");
      const selectedLayers =
        (data.rule || data.applicability_rule)?.layers || [];
      for (const layer of selectedLayers)
        if (
          !(
            await tx.query(
              "SELECT code FROM portfolio.layers WHERE program_id=$1 AND code=$2",
              [pid, layer],
            )
          ).length
        )
          throw new DomainError(
            422,
            "Camada da regra não pertence ao programa.",
          );
      if (kind === "profiles") {
        const gates = await tx.query(
          "SELECT id FROM governance.gate_definitions WHERE program_id IS NULL OR program_id=$1",
          [pid],
        );
        if (
          data.gate_ids.some((gid: string) => !gates.some((g) => g.id === gid))
        )
          throw new DomainError(
            422,
            "Gate não pertence ao catálogo do programa.",
          );
      }
      const fields = Object.keys(schemas[kind].shape),
        values = fields.map((f) =>
          typeof data[f] === "object" ? JSON.stringify(data[f]) : data[f],
        );
      let after: Row;
      if (before)
        [after] = await tx.query(
          `UPDATE ${tables[kind]} SET ${fields.map((f, i) => `${f}=$${i + 1}`).join(",")},version=version+1${kind === "profiles" ? ",updated_at=now()" : ""} WHERE program_id=$${values.length + 1} AND ${kind === "layers" ? "code" : "id"}=$${values.length + 2} RETURNING *`,
          [...values, pid, id],
        );
      else
        [after] = await tx.query(
          `INSERT INTO ${tables[kind]}(program_id,${fields.join(",")}) VALUES($1,${fields.map((_, i) => `$${i + 2}`).join(",")}) RETURNING *`,
          [pid, ...values],
        );
      await audit(
        tx,
        userId,
        pid,
        `catalog_${kind}`,
        kind === "layers" ? pid : after.id,
        before ? "Versioned" : "Created",
        before || null,
        after,
        data.reason,
        randomUUID(),
      );
      return after;
    },
  );
}
export async function gateCatalog(tx: Database, pid: string) {
  const gates = await tx.query(
    "SELECT * FROM governance.gate_definitions WHERE program_id IS NULL OR program_id=$1 ORDER BY code",
    [pid],
  );
  const profiles = await tx.query(
    "SELECT * FROM governance.dod_profiles WHERE program_id=$1 ORDER BY code",
    [pid],
  );
  return { gates, profiles };
}
export async function subjectGateReadiness(
  tx: Database,
  pid: string,
  id: string,
  category?: string,
) {
  const [d] = await tx.query(
    "SELECT * FROM delivery.deliverables WHERE id=$1 AND program_id=$2",
    [id, pid],
  );
  if (!d) throw new DomainError(404, "Entregável não encontrado.");
  const { gates, profiles } = await gateCatalog(tx, pid),
    selection = applicability(d, gates, profiles);
  const selected = selection.gates.filter(
    (g) => g.blocking && (!category || g.category === category),
  );
  const current = await tx.query(
    "SELECT a.* FROM governance.gate_assessments a JOIN portfolio.program_nodes n ON n.id=a.subject_node_id WHERE a.program_id=$1 AND n.entity_type='deliverables' AND n.entity_id=$2",
    [pid, id],
  );
  const effective = effectiveAssessments(gates, current).map((a) =>
    contextualAssessment(a, selection.contextKey),
  );
  const results = selected.map(
    (g) =>
      effective.find((a) => a.gate_id === g.id) || {
        result: "NOT_ASSESSED",
        blocking: true,
      },
  );
  const result = readiness(results as any, selected.length);
  return { ...result, known: !selection.unknown && selected.length > 0 };
}
