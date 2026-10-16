import { ZodError } from "zod";
import { DomainError } from "../domain/rules";
export function problem(
  error: unknown,
  request: Request,
  correlationId: string,
) {
  const sqlCode =
    (error as { code?: string; cause?: { code?: string } })?.code ||
    (error as { cause?: { code?: string } })?.cause?.code;
  const status =
    error instanceof DomainError
      ? error.status
      : error instanceof SyntaxError
        ? 400
        : error instanceof ZodError
          ? 422
          : ["23505", "23503", "23514"].includes(sqlCode || "")
            ? 409
            : 500;
  const detail =
    error instanceof ZodError
      ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      : error instanceof SyntaxError
        ? "JSON inválido."
        : error instanceof DomainError
          ? error.message
          : status === 409
            ? "Código duplicado ou vínculo inválido. Verifique os dados."
            : "Não foi possível concluir a operação. Consulte o identificador de correlação.";
  if (status === 500)
    console.error(
      JSON.stringify({
        level: "error",
        correlationId,
        errorClass: (error as Error)?.name,
        databaseCode: sqlCode,
      }),
    );
  return Response.json(
    {
      type: `urn:mct:problem:${status}`,
      title: status === 500 ? "Erro interno" : "Operação não concluída",
      status,
      detail,
      instance: new URL(request.url).pathname,
      correlationId,
    },
    {
      status,
      headers: {
        "Content-Type": "application/problem+json",
        "X-Correlation-ID": correlationId,
      },
    },
  );
}

export async function readBody(
  req: Pick<Request, "headers" | "body">,
  limit = 8000000,
) {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > limit)
    throw new DomainError(413, "Corpo da requisição excede o limite.");
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new DomainError(413, "Corpo da requisição excede o limite.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function readJSON(req: Request, limit = 8000000): Promise<any> {
  const bytes = await readBody(req, limit);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DomainError(400, "JSON deve usar UTF-8.");
  }
  return JSON.parse(text);
}
