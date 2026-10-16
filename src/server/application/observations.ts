import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DomainError } from "../domain/rules";
import { memberships } from "../infrastructure/auth";
import { idempotent, audit } from "./transactions";
const fields = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(3).max(8000),
  important: z.boolean(),
});
export async function saveObservation(
  userId: string,
  pid: string,
  id: string | undefined,
  input: unknown,
  key: string,
) {
  if (id) z.uuid().parse(id);
  const data = (
    id
      ? fields.extend({ expectedVersion: z.number().int().positive() })
      : fields.extend({ subject_node_id: z.uuid().nullable() })
  )
    .strict()
    .parse(input);
  return idempotent(
    userId,
    key,
    { op: "observation", pid, id, data },
    async (tx) => {
      await tx.query(
        "SELECT id FROM portfolio.programs WHERE id=$1 FOR UPDATE",
        [pid],
      );
      const roles = await memberships(userId, pid, tx);
      // Any contributing member can annotate. Viewer remains read-only; editing is author/manager only.
      const contributes = roles.some((r) => r.role !== "VIEWER");
      const manager = roles.some((r) =>
        ["PROGRAM_ADMIN", "CHIEF_ARCHITECT", "PMO", "EXECUTIVE"].includes(
          r.role,
        ),
      );
      if (!contributes)
        throw new DomainError(
          403,
          "Leitor pode consultar observações, mas não escrever.",
        );
      let before = null;
      if (id) {
        [before] = await tx.query(
          "SELECT * FROM governance.observations WHERE id=$1 AND program_id=$2 FOR UPDATE",
          [id, pid],
        );
        if (!before) throw new DomainError(404, "Observação não encontrada.");
        if (before.author_id !== userId && !manager)
          throw new DomainError(
            403,
            "Somente autor ou gestor pode editar esta observação.",
          );
        if (Number(before.version) !== (data as any).expectedVersion)
          throw new DomainError(
            409,
            "A observação foi atualizada. Recarregue antes de editar.",
          );
      } else if ((data as any).subject_node_id) {
        const nodes = await tx.query(
          "SELECT id FROM portfolio.program_nodes WHERE id=$1 AND program_id=$2",
          [(data as any).subject_node_id, pid],
        );
        if (!nodes.length)
          throw new DomainError(422, "O assunto deve pertencer ao programa.");
      }
      const [after] = id
        ? await tx.query(
            "UPDATE governance.observations SET title=$1,body=$2,important=$3,version=version+1,updated_at=now() WHERE id=$4 AND program_id=$5 RETURNING *",
            [data.title, data.body, data.important, id, pid],
          )
        : await tx.query(
            "INSERT INTO governance.observations(program_id,subject_node_id,author_id,title,body,important) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [
              pid,
              (data as any).subject_node_id,
              userId,
              data.title,
              data.body,
              data.important,
            ],
          );
      await audit(
        tx,
        userId,
        pid,
        "observations",
        after.id,
        id ? "Updated" : "Created",
        before,
        after,
        "Observação contextual",
        randomUUID(),
      );
      return after;
    },
  );
}
