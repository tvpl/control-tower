import {
  createHmac,
  createHash,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { z } from "zod";
import { DomainError } from "../domain/rules";
import { getDb } from "../infrastructure/database";
import { readBody } from "../infrastructure/http";
import { queueConnectionSync } from "./sync-worker";
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function verifyWebhook(
  type: string,
  secret: string,
  body: Uint8Array,
  headers: Headers,
  now = Date.now(),
) {
  if (type === "GITHUB")
    return equal(
      headers.get("x-hub-signature-256") || "",
      `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
    );
  if (type === "GITLAB")
    return equal(headers.get("x-gitlab-token") || "", secret);
  const stamp = headers.get("x-mct-timestamp") || "";
  if (!/^\d{10}$/.test(stamp) || Math.abs(now - Number(stamp) * 1000) > 300000)
    return false;
  return equal(
    headers.get("x-mct-signature") || "",
    `sha256=${createHmac("sha256", secret)
      .update(stamp + ".")
      .update(body)
      .digest("hex")}`,
  );
}
export async function receiveWebhook(id: string, req: Request) {
  z.uuid().parse(id);
  const [connection] = await getDb().query(
    "SELECT * FROM integration.connections WHERE id=$1",
    [id],
  );
  const secret =
    connection?.webhook_secret_env &&
    process.env[connection.webhook_secret_env];
  if (!connection || !secret || !connection.created_by)
    throw new DomainError(404, "Webhook indisponível.");
  const bytes = await readBody(req, 256000);
  if (!verifyWebhook(connection.connector_type, secret, bytes, req.headers))
    throw new DomainError(401, "Assinatura de webhook inválida.");
  const delivery =
    req.headers.get("x-github-delivery") ||
    req.headers.get("x-gitlab-event-uuid") ||
    req.headers.get("x-mct-delivery");
  if (!delivery || delivery.length > 200)
    throw new DomainError(422, "Identificador de entrega obrigatório.");
  const digest = createHash("sha256").update(bytes).digest("hex");
  // Enqueue is idempotent on delivery; persisting receipt afterwards safely recovers a crash between the two operations.
  const [prior] = await getDb().query(
    "SELECT body_hash FROM integration.webhook_deliveries WHERE connection_id=$1 AND delivery_key=$2",
    [id, delivery],
  );
  if (prior) {
    if (prior.body_hash !== digest)
      throw new DomainError(409, "Entrega repetida com conteúdo diferente.");
    return { accepted: true, duplicate: true };
  }
  const job = await queueConnectionSync(
    connection.created_by,
    connection.program_id,
    id,
    `hook:${id}:${createHash("sha256").update(delivery).digest("hex")}`,
  );
  await getDb().query(
    "INSERT INTO integration.webhook_deliveries(connection_id,delivery_key,body_hash) VALUES($1,$2,$3) ON CONFLICT(connection_id,delivery_key) DO NOTHING",
    [id, delivery, digest],
  );
  return { accepted: true, jobId: job.id, correlationId: randomUUID() };
}
