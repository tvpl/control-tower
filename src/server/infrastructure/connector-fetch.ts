import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { DomainError } from "../domain/rules";
export function privateAddress(value: string): boolean {
  const ip = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (ip.includes(":")) {
    if (ip.startsWith("::ffff:")) {
      const tail = ip.slice(7);
      if (isIP(tail) === 4) return privateAddress(tail);
      return true;
    }
    return (
      ip === "::" ||
      ip === "::1" ||
      /^(fc|fd|fe[89ab])/.test(ip) ||
      ip.startsWith("ff")
    );
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && [0, 168].includes(b)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && [18, 19].includes(b))
  );
}
/** Pin the validated DNS answer in the HTTPS lookup callback, retaining TLS hostname checks. */
export const connectorFetch: typeof fetch = async (input, init = {}) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  if (url.protocol !== "https:")
    throw new DomainError(422, "Fonte exige HTTPS.");
  const hostname = url.hostname.replace(/^\[|\]$/g, ""),
    allowed = (process.env.MCT_CONNECTOR_ALLOWED_HOSTS || "")
      .split(",")
      .map((v) => v.trim().toLowerCase());
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true });
  const allowPrivate =
    process.env.MCT_CONNECTOR_ALLOW_PRIVATE === "true" &&
    allowed.includes(url.hostname.toLowerCase());
  if (
    !addresses.length ||
    (!allowPrivate && addresses.some((a) => privateAddress(a.address)))
  )
    throw new DomainError(422, "Destino DNS privado não autorizado.");
  const selected = addresses[0];
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      {
        method: init.method || "GET",
        headers: Object.fromEntries(new Headers(init.headers)),
        signal: init.signal || undefined,
        lookup: (_host, _options, callback) =>
          callback(null, selected.address, selected.family),
      },
      (res) => {
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2000000) {
            res.destroy();
            reject(new DomainError(502, "Resposta da fonte excede 2 MB."));
          } else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(res.headers))
            if (value !== undefined)
              headers.set(key, Array.isArray(value) ? value.join(", ") : value);
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode || 502,
              headers,
            }),
          );
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("Connector timeout")));
    if (init.body) {
      if (typeof init.body !== "string" && !Buffer.isBuffer(init.body)) {
        req.destroy();
        reject(new DomainError(422, "Formato da consulta externa inválido."));
        return;
      }
      req.write(init.body);
    }
    req.end();
  });
};
