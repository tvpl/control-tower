import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DomainError } from "../domain/rules";
import { getDb } from "../infrastructure/database";
import { memberships, hashPassword } from "../infrastructure/auth";
import { signAccessToken, tokenDigest } from "../infrastructure/access-tokens";
import { audit, idempotent } from "./transactions";
const reason = z.string().trim().min(3).max(2000),
  roles = [
    "PROGRAM_ADMIN",
    "CHIEF_ARCHITECT",
    "WORKSTREAM_LEAD",
    "PMO",
    "EXECUTIVE",
    "GATE_APPROVER",
    "VIEWER",
  ] as const;
export async function accessState(userId: string, pid: string) {
  const membership = await memberships(userId, pid),
    db = getDb(),
    manages = membership.some((r) => r.role === "PROGRAM_ADMIN");
  const members = manages
    ? await db.query(
        "SELECT m.*,u.email,u.display_name FROM iam.memberships m JOIN iam.users u ON u.id=m.user_id WHERE m.program_id=$1 ORDER BY u.display_name,m.role",
        [pid],
      )
    : [];
  const tokens = await db.query(
    "SELECT id,name,program_ids,access,created_at,expires_at,revoked_at FROM iam.api_tokens WHERE user_id=$1 AND program_ids @> $2::jsonb ORDER BY created_at DESC",
    [userId, JSON.stringify([pid])],
  );
  return {
    members,
    tokens,
    manages,
    authMode: process.env.AUTH_MODE || "oidc",
    oidcIssuer: process.env.OIDC_ISSUER || null,
  };
}
export async function saveMembership(
  userId: string,
  pid: string,
  id: string | undefined,
  action: "save" | "revoke",
  input: unknown,
  key: string,
) {
  if (id) z.uuid().parse(id);
  const p = (
    action === "revoke"
      ? z.object({ expectedVersion: z.number().int().positive(), reason })
      : z.object({
          email: z.email(),
          role: z.enum(roles),
          workstream_id: z.uuid().nullable(),
          gate_categories: z.array(z.string().min(2).max(50)).max(30),
          domain_ids: z.array(z.uuid()).max(100).default([]),
          data_clearance: z
            .enum(["INTERNAL", "CONFIDENTIAL", "RESTRICTED"])
            .default("INTERNAL"),
          expires_at: z.iso.datetime().nullable(),
          expectedVersion: z.number().int().nonnegative(),
          reason,
        })
  )
    .strict()
    .parse(input) as Record<string, any>;
  return idempotent(
    userId,
    key,
    { op: "membership", pid, id, action, p },
    async (tx) => {
      await tx.query(
        "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
        [pid],
      );
      if (
        !(await memberships(userId, pid, tx)).some(
          (r) => r.role === "PROGRAM_ADMIN",
        )
      )
        throw new DomainError(
          403,
          "Gestão de acesso exige administrador do programa.",
        );
      const [before] = id
        ? await tx.query(
            "SELECT * FROM iam.memberships WHERE id=$1 AND program_id=$2 FOR UPDATE",
            [id, pid],
          )
        : [];
      if (id && !before) throw new DomainError(404, "Vínculo não encontrado.");
      if (Number(before?.version || 0) !== p.expectedVersion)
        throw new DomainError(409, "Permissão alterada. Recarregue.");
      if (
        before?.role === "PROGRAM_ADMIN" &&
        (action === "revoke" || p.expires_at)
      ) {
        const others = await tx.query(
          "SELECT id FROM iam.memberships WHERE program_id=$1 AND role='PROGRAM_ADMIN' AND id<>$2 AND expires_at IS NULL",
          [pid, id],
        );
        if (!others.length)
          throw new DomainError(
            409,
            "Preserve ao menos um administrador permanente do programa.",
          );
      }
      if (action === "revoke") {
        await tx.query("DELETE FROM iam.memberships WHERE id=$1", [id]);
        await audit(
          tx,
          userId,
          pid,
          "memberships",
          id!,
          "Revoked",
          before,
          null,
          p.reason,
          randomUUID(),
        );
        return { id, revoked: true };
      }
      const [target] = await tx.query(
        "SELECT id FROM iam.users WHERE lower(email)=lower($1)",
        [p.email],
      );
      if (!target)
        throw new DomainError(
          422,
          "Identidade não encontrada. Provisione-a antes de atribuir acesso.",
        );
      if (before && (before.user_id !== target.id || before.role !== p.role))
        throw new DomainError(
          422,
          "Identidade e papel são imutáveis; revogue e crie outro vínculo.",
        );
      if (p.expires_at && new Date(p.expires_at) <= new Date())
        throw new DomainError(422, "Validade deve ser futura.");
      if (p.role === "WORKSTREAM_LEAD" && !p.workstream_id)
        throw new DomainError(422, "Líder exige frente explícita.");
      if (
        p.workstream_id &&
        !["WORKSTREAM_LEAD", "GATE_APPROVER"].includes(p.role)
      )
        throw new DomainError(
          422,
          "Escopo por frente aplica-se a líder e aprovador.",
        );
      if (
        p.workstream_id &&
        !(
          await tx.query(
            "SELECT id FROM portfolio.workstreams WHERE id=$1 AND program_id=$2",
            [p.workstream_id, pid],
          )
        ).length
      )
        throw new DomainError(422, "Frente não pertence ao programa.");
      if (
        p.role !== "GATE_APPROVER" &&
        (p.gate_categories.length || p.domain_ids.length)
      )
        throw new DomainError(
          422,
          "Categorias e domínios de alçada aplicam-se a aprovadores de gate.",
        );
      if (p.role === "GATE_APPROVER" && !p.gate_categories.length)
        throw new DomainError(422, "Aprovador exige categorias explícitas.");
      for (const category of p.gate_categories)
        if (
          !(
            await tx.query(
              "SELECT id FROM governance.gate_definitions WHERE category=$1 AND (program_id IS NULL OR program_id=$2) LIMIT 1",
              [category, pid],
            )
          ).length
        )
          throw new DomainError(422, "Categoria não existe no catálogo.");
      for (const domain of p.domain_ids)
        if (
          !(
            await tx.query(
              "SELECT id FROM portfolio.domains WHERE id=$1 AND program_id=$2",
              [domain, pid],
            )
          ).length
        )
          throw new DomainError(422, "Domínio não pertence ao programa.");
      let after;
      if (before)
        [after] = await tx.query(
          "UPDATE iam.memberships SET workstream_id=$1,gate_categories=$2::jsonb,domain_ids=$3::jsonb,data_clearance=$4,expires_at=$5,version=version+1 WHERE id=$6 RETURNING *",
          [
            p.workstream_id,
            JSON.stringify(p.gate_categories),
            JSON.stringify(p.domain_ids),
            p.data_clearance,
            p.expires_at,
            id,
          ],
        );
      else
        [after] = await tx.query(
          "INSERT INTO iam.memberships(user_id,program_id,role,workstream_id,gate_categories,domain_ids,data_clearance,expires_at) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8) RETURNING *",
          [
            target.id,
            pid,
            p.role,
            p.workstream_id,
            JSON.stringify(p.gate_categories),
            JSON.stringify(p.domain_ids),
            p.data_clearance,
            p.expires_at,
          ],
        );
      await audit(
        tx,
        userId,
        pid,
        "memberships",
        after.id,
        before ? "Updated" : "Granted",
        before || null,
        after,
        p.reason,
        randomUUID(),
      );
      return after;
    },
  );
}
export async function provisionIdentity(
  userId: string,
  pid: string,
  input: unknown,
  key: string,
) {
  const common = {
    email: z.email().transform((v) => v.toLowerCase()),
    name: z.string().trim().min(3).max(200),
    reason,
  };
  const p = z
    .discriminatedUnion("mode", [
      z
        .object({
          ...common,
          mode: z.literal("LOCAL"),
          password: z.string().min(12).max(200),
        })
        .strict(),
      z
        .object({
          ...common,
          mode: z.literal("OIDC"),
          subject: z.string().min(1).max(500),
        })
        .strict(),
    ])
    .parse(input);
  // Store only a digest of the idempotency input for passwords; never include the plaintext in logs/audit/response.
  const safe = {
    ...p,
    ...(p.mode === "LOCAL" ? { password: tokenDigest(p.password) } : {}),
  };
  return idempotent(
    userId,
    key,
    { op: "provision", pid, p: safe },
    async (tx) => {
      await tx.query(
        "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
        [pid],
      );
      if (
        !(await memberships(userId, pid, tx)).some(
          (r) => r.role === "PROGRAM_ADMIN",
        )
      )
        throw new DomainError(403, "Provisionamento exige administrador.");
      if (
        p.mode === "LOCAL" &&
        (process.env.AUTH_MODE !== "local" ||
          (process.env.NODE_ENV === "production" &&
            process.env.ALLOW_LOCAL_PREVIEW !== "true"))
      )
        throw new DomainError(403, "Identidades locais desabilitadas.");
      if (p.mode === "OIDC" && !process.env.OIDC_ISSUER)
        throw new DomainError(
          503,
          "Configure o issuer corporativo antes de provisionar identidades OIDC.",
        );
      const [record] = await tx.query(
        "INSERT INTO iam.users(subject,display_name,email,password_hash) VALUES($1,$2,$3,$4) RETURNING id,display_name,email",
        [
          p.mode === "LOCAL"
            ? `local:${randomUUID()}`
            : `${process.env.OIDC_ISSUER}|${p.subject}`,
          p.name,
          p.email,
          p.mode === "LOCAL" ? hashPassword(p.password) : null,
        ],
      );
      await audit(
        tx,
        userId,
        pid,
        "identities",
        record.id,
        "Provisioned",
        null,
        record,
        p.reason,
        randomUUID(),
      );
      return record;
    },
  );
}
export async function issueAPIToken(userId: string, input: unknown) {
  const p = z
    .object({
      name: z.string().trim().min(3).max(100),
      programIds: z
        .array(z.uuid())
        .min(1)
        .max(100)
        .refine((ids) => new Set(ids).size === ids.length),
      access: z.enum(["READ", "WRITE"]),
      expiresAt: z.iso.datetime(),
    })
    .strict()
    .parse(input);
  const expires = new Date(p.expiresAt).getTime();
  if (expires <= Date.now() || expires > Date.now() + 90 * 86400000)
    throw new DomainError(422, "Token exige validade futura de até 90 dias.");
  const id = randomUUID(),
    token = await signAccessToken(userId, id, p.expiresAt);
  await getDb().transaction(async (tx) => {
    for (const pid of p.programIds) {
      const roles = await memberships(userId, pid, tx);
      if (p.access === "WRITE" && roles.every((r) => r.role === "VIEWER"))
        throw new DomainError(
          403,
          "Leitor pode emitir somente token de leitura.",
        );
    }
    await tx.query(
      "INSERT INTO iam.api_tokens(id,user_id,name,token_digest,program_ids,access,expires_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)",
      [
        id,
        userId,
        p.name,
        tokenDigest(token),
        JSON.stringify(p.programIds),
        p.access,
        p.expiresAt,
      ],
    );
    for (const pid of p.programIds)
      await audit(
        tx,
        userId,
        pid,
        "api_tokens",
        id,
        "Issued",
        null,
        { id, name: p.name, access: p.access, expires_at: p.expiresAt },
        "Emissão explícita pelo titular",
        randomUUID(),
      );
  });
  return { id, token, expiresAt: p.expiresAt };
}
export async function revokeAPIToken(userId: string, pid: string, id: string) {
  z.uuid().parse(id);
  await memberships(userId, pid);
  return getDb().transaction(async (tx) => {
    const [before] = await tx.query(
      "SELECT id,name FROM iam.api_tokens WHERE id=$1 AND user_id=$2 AND program_ids @> $3::jsonb FOR UPDATE",
      [id, userId, JSON.stringify([pid])],
    );
    if (!before) throw new DomainError(404, "Token não encontrado.");
    await tx.query(
      "UPDATE iam.api_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1",
      [id],
    );
    await audit(
      tx,
      userId,
      pid,
      "api_tokens",
      id,
      "Revoked",
      before,
      { id, revoked: true },
      "Revogação pelo titular",
      randomUUID(),
    );
    return { id, revoked: true };
  });
}
