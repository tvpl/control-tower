import { z } from "zod";
import { DomainError } from "../domain/rules";
import { memberships } from "../infrastructure/auth";
import { getDb } from "../infrastructure/database";
import { idempotent } from "./transactions";
const notable =
  /\.(Approved|Rejected|Published|ExceptionRevoked|Assessed|Reconciled|Detected|HealthOverridden|Reviewed|ReviewRequested)$/;
export async function publishOutbox(limit = 100) {
  return getDb().transaction(async (tx) => {
    const events = await tx.query(
      "SELECT * FROM audit.outbox WHERE published_at IS NULL ORDER BY occurred_at,id FOR UPDATE SKIP LOCKED LIMIT $1",
      [Math.max(1, Math.min(500, limit))],
    );
    for (const event of events) {
      if (notable.test(event.event_type)) {
        // Notification contains no business payload or classified text. Open the authorized module for details.
        await tx.query(
          "INSERT INTO governance.notifications(program_id,user_id,event_id,title,body) SELECT DISTINCT $1::uuid,user_id,$2::uuid,'Atualização de governança',$3 FROM iam.memberships WHERE program_id=$1 AND (expires_at IS NULL OR expires_at>now()) AND NOT EXISTS(SELECT 1 FROM iam.notification_preferences np WHERE np.user_id=iam.memberships.user_id AND np.program_id=iam.memberships.program_id AND NOT np.enabled) ON CONFLICT(user_id,event_id) DO NOTHING",
          [
            event.program_id,
            event.id,
            `Evento ${event.event_type}. Consulte o módulo correspondente e a trilha de auditoria.`,
          ],
        );
      }
      await tx.query("UPDATE audit.outbox SET published_at=now() WHERE id=$1", [
        event.id,
      ]);
    }
    return { published: events.length };
  });
}
export async function notifications(userId: string, pid: string) {
  await memberships(userId, pid);
  const [count] = await getDb().query(
    "SELECT count(*)::integer AS unread FROM governance.notifications WHERE program_id=$1 AND user_id=$2 AND read_at IS NULL",
    [pid, userId],
  );
  return {
    enabled:
      (
        await getDb().query(
          "SELECT enabled FROM iam.notification_preferences WHERE user_id=$1 AND program_id=$2",
          [userId, pid],
        )
      )[0]?.enabled ?? true,
    unread: Number(count.unread),
    items: await getDb().query(
      "SELECT id,title,body,read_at,created_at FROM governance.notifications WHERE program_id=$1 AND user_id=$2 ORDER BY created_at DESC,id DESC LIMIT 100",
      [pid, userId],
    ),
  };
}
export async function readNotification(
  userId: string,
  pid: string,
  id: string,
  key: string,
) {
  z.uuid().parse(id);
  return idempotent(
    userId,
    key,
    { op: "notification-read", pid, id },
    async (tx) => {
      await memberships(userId, pid, tx);
      const [record] = await tx.query(
        "UPDATE governance.notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 AND program_id=$2 AND user_id=$3 RETURNING id,read_at",
        [id, pid, userId],
      );
      if (!record) throw new DomainError(404, "Notificação não encontrada.");
      return record;
    },
  );
}

export async function notificationPreference(
  userId: string,
  pid: string,
  input: unknown,
  key: string,
) {
  const p = z.object({ enabled: z.boolean() }).strict().parse(input);
  return idempotent(
    userId,
    key,
    { op: "notification-preference", pid, p },
    async (tx) => {
      await memberships(userId, pid, tx);
      const [row] = await tx.query(
        "INSERT INTO iam.notification_preferences(user_id,program_id,enabled) VALUES($1,$2,$3) ON CONFLICT(user_id,program_id) DO UPDATE SET enabled=excluded.enabled,updated_at=now() RETURNING enabled",
        [userId, pid, p.enabled],
      );
      return row;
    },
  );
}
