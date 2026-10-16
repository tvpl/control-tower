import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { DomainError } from "../domain/rules";
export const IMPORT_COLUMNS = [
  "program_code",
  "domain_code",
  "workstream_code",
  "capability_code",
  "deliverable_code",
  "name",
  "layer",
  "owner_email",
  "stage",
  "execution_status",
  "forecast_date",
  "source_url",
  "acceptance_criteria",
  "deliverable_type",
  "criticality",
  "area_code",
  "squad_code",
  "transverse_obligation",
  "weight",
  "external_id",
];
export const REQUIRED_IMPORT_COLUMNS = [
  "program_code",
  "domain_code",
  "workstream_code",
  "capability_code",
  "deliverable_code",
  "name",
  "layer",
  "owner_email",
];
export function validateHeaders(headers: string[]) {
  if (new Set(headers).size !== headers.length)
    throw new DomainError(422, "Cabeçalhos duplicados.");
  const unknown = headers.filter((h) => !IMPORT_COLUMNS.includes(h));
  if (unknown.length)
    throw new DomainError(
      422,
      `Colunas não suportadas: ${unknown.join(", ")}.`,
    );
  const missing = REQUIRED_IMPORT_COLUMNS.filter((h) => !headers.includes(h));
  if (missing.length)
    throw new DomainError(422, `Colunas obrigatórias: ${missing.join(", ")}.`);
}
/** Verify actual deflated sizes before ExcelJS sees the ZIP, bounded to 25 MB and 500 entries. */
export function validateWorkbookZip(buffer: Buffer) {
  if (buffer.length > 5000000) throw new DomainError(413, "XLSX excede 5 MB.");
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0)
    throw new DomainError(422, "Arquivo XLSX inválido ou criptografado.");
  const count = buffer.readUInt16LE(end + 10),
    offset = buffer.readUInt32LE(end + 16);
  if (count > 500 || count === 65535 || offset >= buffer.length)
    throw new DomainError(413, "Estrutura XLSX excede os limites.");
  let cursor = offset,
    total = 0,
    foundSheet = false;
  for (let i = 0; i < count; i++) {
    if (
      cursor + 46 > buffer.length ||
      buffer.readUInt32LE(cursor) !== 0x02014b50
    )
      throw new DomainError(422, "Diretório ZIP inválido.");
    const flags = buffer.readUInt16LE(cursor + 8),
      method = buffer.readUInt16LE(cursor + 10),
      compressed = buffer.readUInt32LE(cursor + 20),
      size = buffer.readUInt32LE(cursor + 24),
      nameLength = buffer.readUInt16LE(cursor + 28),
      extra = buffer.readUInt16LE(cursor + 30),
      comment = buffer.readUInt16LE(cursor + 32),
      local = buffer.readUInt32LE(cursor + 42);
    if (
      cursor + 46 + nameLength + extra + comment > buffer.length ||
      local + 30 > buffer.length
    )
      throw new DomainError(422, "Limites ZIP inválidos.");
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      /(^|\/)\.\.(\/|$)|vbaProject|externalLinks|embeddings/i.test(name)
    )
      throw new DomainError(
        422,
        "Macros, arquivos externos, criptografia ou caminhos inválidos não são aceitos.",
      );
    if (buffer.readUInt32LE(local) !== 0x04034b50)
      throw new DomainError(422, "Entrada ZIP inválida.");
    const localNameLength = buffer.readUInt16LE(local + 26);
    if (
      buffer.readUInt16LE(local + 8) !== method ||
      buffer.readUInt16LE(local + 6) !== flags ||
      buffer.toString("utf8", local + 30, local + 30 + localNameLength) !==
        name ||
      /^(\/|\\)|\\|\0/.test(name)
    )
      throw new DomainError(422, "Entrada ZIP inconsistente.");
    total += size;
    if (total > 25000000)
      throw new DomainError(413, "Conteúdo descompactado excede 25 MB.");
    const dataStart =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    if (dataStart + compressed > buffer.length)
      throw new DomainError(422, "Conteúdo ZIP truncado.");
    const data = buffer.subarray(dataStart, dataStart + compressed);
    try {
      const expanded =
        method === 0
          ? data
          : inflateRawSync(data, {
              maxOutputLength: Math.min(25000000, size + 1),
            });
      if (expanded.length !== size) throw new Error("Size mismatch");
      if (
        /\.xml$/i.test(name) &&
        /<!DOCTYPE|<!ENTITY/i.test(expanded.toString("utf8"))
      )
        throw new Error("DTD not allowed");
    } catch {
      throw new DomainError(422, "Tamanho ou compressão de entrada inválido.");
    }
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) foundSheet = true;
    cursor += 46 + nameLength + extra + comment;
  }
  if (!foundSheet) throw new DomainError(422, "XLSX sem planilha.");
}
export async function normalizeImportFile(
  filename: string,
  base64: string,
  sheetName?: string,
) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length > 6700000)
    throw new DomainError(413, "Arquivo inválido ou superior a 5 MB.");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 5000000)
    throw new DomainError(413, "Arquivo vazio ou superior a 5 MB.");
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (/\.csv$/i.test(filename)) {
    let csv: string;
    try {
      csv = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new DomainError(422, "CSV deve usar UTF-8.");
    }
    if (csv.includes("\0"))
      throw new DomainError(422, "CSV contém dados binários.");
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
    });
    if (parsed.errors.length) throw new DomainError(422, "CSV inválido.");
    validateHeaders(parsed.meta.fields || []);
    if (parsed.data.length > 10000)
      throw new DomainError(413, "Limite: 10.000 linhas.");
    return {
      csv: Papa.unparse(parsed.data),
      digest,
      filename: filename.split(/[\\/]/).pop()!.slice(0, 200),
      sheet: null,
      rowNumbers: parsed.data.map((_, i) => i + 2),
    };
  }
  if (!/\.xlsx$/i.test(filename))
    throw new DomainError(422, "Selecione CSV ou XLSX.");
  validateWorkbookZip(bytes);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never, {
      ignoreNodes: [
        "drawing",
        "picture",
        "extLst",
        "conditionalFormatting",
        "dataValidations",
      ],
    });
  } catch {
    throw new DomainError(422, "Não foi possível ler o XLSX.");
  }
  const sheet = sheetName
    ? workbook.getWorksheet(sheetName)
    : workbook.worksheets[0];
  if (!sheet) throw new DomainError(422, "Planilha não encontrada.");
  if (sheet.rowCount > 10001 || sheet.columnCount > IMPORT_COLUMNS.length)
    throw new DomainError(413, "Planilha excede o limite de linhas/colunas.");
  const text = (cell: ExcelJS.Cell, column?: string): string => {
    const v = cell.value;
    if (v == null) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v !== "object") return String(v);
    if ("formula" in v || "sharedFormula" in v)
      throw new DomainError(
        422,
        `Fórmula em ${cell.address}; exporte como valores.`,
      );
    if ("richText" in v) return v.richText.map((x) => x.text).join("");
    if ("hyperlink" in v) return column === "source_url" ? v.hyperlink : v.text;
    throw new DomainError(
      422,
      `Célula ${cell.address} contém valor não suportado.`,
    );
  };
  const headers = Array.from({ length: sheet.columnCount }, (_, i) =>
    text(sheet.getCell(1, i + 1)).trim(),
  );
  validateHeaders(headers);
  const rows: Record<string, string>[] = [],
    rowNumbers: number[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = Object.fromEntries(
      headers.map((h, i) => [h, text(sheet.getCell(r, i + 1), h)]),
    );
    if (Object.values(row).some(Boolean)) {
      rows.push(row);
      rowNumbers.push(r);
    }
  }
  return {
    csv: Papa.unparse(rows, { columns: headers }),
    digest,
    filename: filename.split(/[\\/]/).pop()!.slice(0, 200),
    sheet: sheet.name,
    rowNumbers,
  };
}
