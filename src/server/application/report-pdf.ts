import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { DomainError } from "../domain/rules";
import { assertReadable } from "../domain/access";
import { compareSnapshots } from "../domain/report-comparison";
import { memberships } from "../infrastructure/auth";
import { getDb, type Row } from "../infrastructure/database";
import { enqueueJob, saveJobArtifact } from "./jobs";
export async function queueReportPDF(
  userId: string,
  pid: string,
  id: string,
  key: string,
) {
  const roles = await memberships(userId, pid),
    [report] = await getDb().query(
      "SELECT * FROM reporting.reports WHERE id=$1 AND program_id=$2",
      [id, pid],
    );
  if (!report) throw new DomainError(404, "Report não encontrado.");
  const snapshots = await getDb().query(
    "SELECT * FROM reporting.snapshots WHERE program_id=$1 AND (id=$2 OR id=$3)",
    [pid, report.snapshot_id, report.previous_snapshot_id],
  );
  for (const snap of snapshots) assertReadable(snap, roles);
  return enqueueJob(
    userId,
    pid,
    "REPORT_PDF",
    { reportId: id, reportVersion: Number(report.version) },
    key,
  );
}
export async function renderReportPDF(
  report: Row,
  snapshot: Row,
  previous?: Row,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regular, bold] = await Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/NotoSans-Regular.ttf")),
    readFile(path.join(process.cwd(), "public/fonts/NotoSans-Bold.ttf")),
  ]);
  const font = await pdf.embedFont(regular, { subset: true }),
    strong = await pdf.embedFont(bold, { subset: true }),
    supported = new Set(font.getCharacterSet());
  let missing = 0,
    page = pdf.addPage([595.28, 841.89]),
    y = 778;
  const left = 44,
    width = 507,
    ink = rgb(0.15, 0.14, 0.13),
    muted = rgb(0.35, 0.32, 0.3),
    orange = rgb(0.78, 0.25, 0);
  const clean = (v: unknown) =>
    [
      ...String(v ?? "Não informado").replace(
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
        "",
      ),
    ]
      .map((c) =>
        supported.has(c.codePointAt(0)!) || c === "\n" || c === "\t"
          ? c
          : (missing++, "?"),
      )
      .join("");
  function newPage() {
    page = pdf.addPage([595.28, 841.89]);
    y = 778;
    page.drawText("MODERNIZATION CONTROL TOWER", {
      x: left,
      y: 808,
      font: strong,
      size: 8,
      color: orange,
    });
  }
  function write(value: unknown, size = 10, emphasis = false, color = ink) {
    const selected = emphasis ? strong : font,
      raw = clean(value).replaceAll("\t", "  ");
    for (const paragraph of raw.split("\n")) {
      const words = paragraph.split(/\s+/),
        lines: string[] = [],
        lineWords: string[] = [];
      for (const word of words) {
        let rest = word;
        while (rest && selected.widthOfTextAtSize(rest, size) > width) {
          let take = 1;
          while (
            take < rest.length &&
            selected.widthOfTextAtSize(rest.slice(0, take + 1), size) <= width
          )
            take++;
          if (lineWords.length) {
            lines.push(lineWords.join(" "));
            lineWords.length = 0;
          }
          lines.push(rest.slice(0, take));
          rest = rest.slice(take);
        }
        if (
          selected.widthOfTextAtSize([...lineWords, rest].join(" "), size) >
            width &&
          lineWords.length
        ) {
          lines.push(lineWords.join(" "));
          lineWords.length = 0;
        }
        if (rest) lineWords.push(rest);
      }
      if (lineWords.length || !lines.length) lines.push(lineWords.join(" "));
      for (const line of lines) {
        if (y < 65) newPage();
        page.drawText(line, { x: left, y, font: selected, size, color });
        y -= size * 1.55;
      }
      y -= 4;
    }
  }
  function heading(value: string) {
    if (y < 110) newPage();
    y -= 12;
    write(value, 13, true, orange);
  }
  const p = snapshot.payload,
    m = p.metrics,
    context = p.context || {},
    format = (date: string) =>
      new Date(date).toLocaleString("pt-BR", {
        timeZone: context.programs?.[0]?.timezone || "America/Sao_Paulo",
      });
  pdf.setTitle(clean(report.title));
  pdf.setAuthor("Modernization Control Tower");
  pdf.setSubject(`Report ${report.id} / snapshot ${snapshot.id}`);
  page.drawRectangle({
    x: 0,
    y: 831,
    width: 595.28,
    height: 11,
    color: orange,
  });
  write("MODERNIZATION CONTROL TOWER / REPORT EXECUTIVO", 9, true, orange);
  y -= 12;
  write(report.title, 22, true);
  write(
    `${report.status === "PUBLISHED" ? "PUBLICADO" : "NÃO PUBLICADO"} · Snapshot ${format(snapshot.as_of)} · ${snapshot.formula_version}`,
    9,
    false,
    muted,
  );
  y -= 14;
  const tiles = [
    [`${m.accepted}/${m.total}`, "Entregas aceitas"],
    [
      m.progress == null ? "—" : `${m.progress}%`,
      m.provisional ? "Avanço provisório" : "Avanço ponderado",
    ],
    [String(m.blocked), "Execuções bloqueadas"],
    [
      p.readiness?.percentage == null ? "—" : `${p.readiness.percentage}%`,
      "Gates satisfeitos",
    ],
  ];
  for (let i = 0; i < tiles.length; i++) {
    const x = left + i * 129;
    page.drawRectangle({
      x,
      y: y - 67,
      width: 120,
      height: 76,
      color: rgb(1, 0.95, 0.9),
    });
    page.drawText(clean(tiles[i][0]), {
      x: x + 10,
      y: y - 20,
      font: strong,
      size: 21,
      color: ink,
    });
    page.drawText(clean(tiles[i][1]), {
      x: x + 10,
      y: y - 46,
      font,
      size: 7.5,
      color: muted,
    });
  }
  y -= 92;
  write(
    `Avanço: ${m.numerator}/${m.denominator} ${m.provisional ? "itens por contagem; provisório" : "unidades de peso da baseline"}. Aceite, execução e prontidão são dimensões independentes.`,
    9,
    false,
    muted,
  );
  heading("Análise e recomendações");
  write(report.narrative, 11);
  const list = (title: string, rows: Row[], describe: (r: Row) => string) => {
    heading(`${title} (${rows.length})`);
    for (const r of rows.slice(0, 200)) write(describe(r));
    if (!rows.length)
      write("Nenhum registro neste snapshot.", 10, false, muted);
    if (rows.length > 200)
      write(
        `Exibidos 200 de ${rows.length}. O JSON exportado contém a lista integral.`,
        9,
        false,
        muted,
      );
  };
  list(
    "Riscos, problemas e ações abertos",
    (p.raid || []).filter((r: Row) => r.status !== "RESOLVED"),
    (r) =>
      `${r.title} · ${r.severity} · ${r.action_plan || "Sem plano informado"}`,
  );
  list(
    "Decisões propostas",
    (p.decisions || []).filter((d: Row) => d.status === "PROPOSED"),
    (d) => `${d.code} · ${d.name} · Prazo: ${d.due_date || "Não informado"}`,
  );
  list(
    "Marcos",
    context.milestones || [],
    (r) =>
      `${r.name} · Baseline ${r.baseline_date || "—"} · Forecast ${r.forecast_date || "—"}`,
  );
  if (previous) {
    const diff = compareSnapshots(snapshot, previous);
    heading(`Mudanças desde ${format(previous.as_of)}`);
    write(
      `${diff.added.length} entregáveis adicionados, ${diff.removed.length} removidos e ${diff.changed.length} alterados. ${diff.comparable ? "Mesma versão de fórmula." : "Fórmulas diferentes: não comparar deltas de KPI."}`,
    );
    for (const collection of diff.collections.filter(
      (c) =>
        c.available && (c.added.length || c.removed.length || c.changed.length),
    ))
      write(
        `${collection.kind}: +${collection.added.length} / -${collection.removed.length} / ${collection.changed.length} alterações.`,
        9,
      );
    for (const d of diff.changed.slice(0, 200)) {
      write(`${d.code} · ${d.name}`, 10, true);
      write(
        d.fields
          .map(
            (f) =>
              `${f.field}: ${typeof f.before === "object" ? JSON.stringify(f.before) : (f.before ?? "—")} → ${typeof f.after === "object" ? JSON.stringify(f.after) : (f.after ?? "—")}`,
          )
          .join("\n"),
        9,
      );
    }
    if (diff.changed.length > 200)
      write(
        "Detalhamento limitado a 200 entregáveis; consulte o JSON integral.",
        9,
        false,
        muted,
      );
  }
  heading("Autoria, revisão e integridade");
  const authorName = (id: string) =>
    context.users?.find((u: Row) => u.id === id)?.display_name || id;
  write(
    `Autor: ${authorName(report.author_id)}\nRevisor: ${report.reviewer_id ? authorName(report.reviewer_id) : "Pendente"}\nJustificativa: ${report.review_reason || "Pendente"}\nPublicação: ${report.published_at ? format(report.published_at) : "Pendente"}`,
    9,
  );
  write(
    `Snapshot SHA-256: ${snapshot.payload_hash}\nReport SHA-256: ${report.payload_hash}`,
    8,
    false,
    muted,
  );
  if (missing)
    write(
      `${missing} caracteres sem glifo foram representados por "?". Consulte o texto original no JSON.`,
      8,
      false,
      muted,
    );
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: left, y: 44 },
      end: { x: left + width, y: 44 },
      thickness: 0.5,
      color: rgb(0.85, 0.82, 0.78),
    });
    p.drawText(`${i + 1} / ${pages.length} · Report interno · ${report.id}`, {
      x: left,
      y: 29,
      font,
      size: 7,
      color: muted,
    });
  });
  return pdf.save();
}
export async function processPDFJob(job: Row) {
  const roles = await memberships(job.actor_id, job.program_id),
    [report] = await getDb().query(
      "SELECT * FROM reporting.reports WHERE id=$1 AND program_id=$2",
      [job.input.reportId, job.program_id],
    );
  if (!report) throw new DomainError(404, "Report não encontrado.");
  if (
    job.input.reportVersion &&
    Number(report.version) !== job.input.reportVersion
  )
    throw new DomainError(
      409,
      "Report foi revisado após a solicitação. Gere o PDF da versão atual.",
    );
  const snapshots = await getDb().query(
    "SELECT * FROM reporting.snapshots WHERE program_id=$1 AND (id=$2 OR id=$3)",
    [job.program_id, report.snapshot_id, report.previous_snapshot_id],
  );
  for (const snap of snapshots) assertReadable(snap, roles);
  const snapshot = snapshots.find((s) => s.id === report.snapshot_id);
  if (!snapshot) throw new DomainError(404, "Snapshot não encontrado.");
  const bytes = await renderReportPDF(
    report,
    snapshot,
    snapshots.find((s) => s.id === report.previous_snapshot_id),
  );
  return saveJobArtifact(
    job,
    `report-${report.id}.pdf`,
    "application/pdf",
    bytes,
  );
}
