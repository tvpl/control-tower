export async function api(
  path: string,
  programId?: string,
  method = "GET",
  body?: unknown,
  version?: number,
  idempotencyKey?: string,
) {
  const res = await fetch(
    `/api/v1/${path}${programId ? `${path.includes("?") ? "&" : "?"}programId=${encodeURIComponent(programId)}` : ""}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(version ? { "If-Match": `"${version}"` } : {}),
        ...(method !== "GET"
          ? { "Idempotency-Key": idempotencyKey || crypto.randomUUID() }
          : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
  );
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.detail || "Não foi possível concluir a operação.");
  return data;
}
export function download(
  name: string,
  data: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
