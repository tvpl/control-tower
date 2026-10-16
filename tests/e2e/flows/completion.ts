import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
const origin = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
export async function completionJourney(
  page: Page,
  project: { id: string; code: string },
) {
  page.setDefaultTimeout(12000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByLabel("Tema visual").selectOption("orange");
  const pid = project.id,
    post = async (path: string, data: any) => {
      const r = await page.request.post(`/api/v1/${path}?programId=${pid}`, {
        headers: { Origin: origin, "Idempotency-Key": randomUUID() },
        data,
      });
      expect(r.ok(), await r.text()).toBe(true);
      return r.json();
    };
  let state = await (
    await page.request.get(`/api/v1/state?programId=${pid}`)
  ).json();
  const domain = await post("domains", {
    code: "ASYNC",
    name: "Domínio de QA",
    ownerId: state.users[0].id,
  });
  expect(domain.ownerId).toBe(state.users[0].id);
  await post("capabilities", {
    code: "ASYNC-CAP",
    name: "Feature assíncrona",
    domainId: domain.id,
  });
  const csv = `program_code,domain_code,workstream_code,capability_code,deliverable_code,name,layer,owner_email,stage,execution_status,forecast_date,source_url,acceptance_criteria\n${project.code},ASYNC,${state.workstreams[0].code},ASYNC-CAP,ASYNC-UI,Importação com origem,BACKEND,admin@demo.local,IDENTIFIED,NOT_STARTED,2026-12-01,https://source.test/record,Comprovar rastreabilidade`;
  await page.getByRole("button", { name: "Entregáveis", exact: true }).click();
  for (const filter of [
    "domínio",
    "frente",
    "release",
    "área",
    "squad",
    "camada",
    "responsável",
  ])
    await page
      .getByLabel(`Filtrar por ${filter}`, { exact: true })
      .selectOption("");
  await page
    .getByRole("button", { name: "Importar CSV / XLSX", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByText("Colar conteúdo CSV", { exact: false }).click();
  await dialog.getByLabel("Conteúdo CSV para importar").fill(csv);
  await dialog.getByLabel("Nome da fonte de importação").fill("qa-ui");
  await dialog
    .getByRole("button", { name: "Validar prévia", exact: true })
    .click();
  await expect(
    dialog.getByText("Validação aprovada", { exact: false }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    dialog.getByRole("button", { name: "Confirmar importação" }),
  ).toBeEnabled();
  const before = await (
    await page.request.get(`/api/v1/deliverables?programId=${pid}&q=ASYNC-UI`)
  ).json();
  expect(before.items).toHaveLength(0);
  await dialog.getByRole("button", { name: "Confirmar importação" }).click();
  await expect(dialog).toHaveCount(0, { timeout: 20000 });
  await page
    .getByRole("button", { name: /ASYNC-UI Importação com origem/ })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByText("Origem dos campos e rastreabilidade", { exact: true })
    .click();
  await expect(
    dialog.getByRole("link", { name: "Abrir fonte" }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/implementation/completion-provenance.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Fechar painel" }).click();
  const snap = await post("snapshots", {});
  const report = await post("reports", {
    title: "Report assíncrono de QA",
    narrative:
      "Importação e origem conferidas. Revisar prontidão antes de avançar.",
    snapshotId: snap.id,
    previousSnapshotId: null,
  });
  await page
    .getByRole("button", { name: "Atualizar dados", exact: true })
    .click();
  await page.getByRole("button", { name: "Relatórios", exact: true }).click();
  await page.getByRole("button", { name: /Report assíncrono de QA/ }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Gerar PDF no servidor" }).click();
  await expect(dialog.getByRole("link", { name: "Baixar PDF" })).toBeVisible({
    timeout: 20000,
  });
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Baixar PDF" }).click();
  await (await downloading).saveAs("/private/tmp/mct-completion-report.pdf");
  await page.screenshot({
    path: "docs/implementation/completion-report-pdf.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Fechar painel" }).click();
  await page
    .getByRole("button", { name: "Análise e cenários", exact: true })
    .click();
  await page.getByRole("button", { name: "Gerar síntese por regras" }).click();
  await expect(
    page.getByText("SÍNTESE DETERMINÍSTICA", { exact: true }),
  ).toBeVisible();
  state = await (
    await page.request.get(`/api/v1/state?programId=${pid}`)
  ).json();
  const imported = state.deliverables.find((d: any) => d.code === "ASYNC-UI"),
    node = state.nodes.find((n: any) => n.entity_id === imported.id);
  await page.getByLabel("Origem da simulação").selectOption(node.id);
  await page.getByRole("button", { name: "Simular propagação" }).click();
  await expect(
    page.getByRole("heading", { name: /entregáveis no cenário/ }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include(".intelligence-workspace")
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/implementation/completion-intelligence.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Administração", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Catálogos & DoD", exact: true })
    .click();
  await page.getByRole("button", { name: /Critérios de gate/ }).click();
  await page
    .getByRole("button", { name: "Nova definição", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Código da definição").fill("QA-UI");
  await dialog.getByLabel("Nome da definição").fill("Critério visual de QA");
  await dialog
    .getByLabel("Critério verificável")
    .fill("Comprovar resultado com evidência");
  await dialog
    .getByLabel("Motivo da configuração")
    .fill("Validar configuração versionada");
  await dialog.getByRole("button", { name: "Salvar configuração" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /^Perfis/ }).click();
  await page
    .getByRole("button", { name: "Nova definição", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Código da definição").fill("QA-PROFILE");
  await dialog.getByLabel("Nome da definição").fill("Perfil visual de QA");
  await dialog.getByLabel(/Critério visual de QA · QA-UI/).check();
  await dialog.getByLabel("Camadas aplicáveis").selectOption(["BACKEND"]);
  await dialog
    .getByLabel("Motivo da configuração")
    .fill("Vincular gate ao perfil de backend");
  await dialog.getByRole("button", { name: "Salvar configuração" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Perfil visual de QA/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Políticas", exact: true }).click();
  await page.getByLabel("Universo estimado de capacidades").fill("200");
  await page
    .getByLabel("Fonte da estimativa de inventário")
    .fill("Catálogo sintético de referência de QA");
  await page.getByLabel("Cadência máxima em dias").fill("10");
  await page
    .getByLabel("Motivo da política do programa")
    .fill("Cadência validada em QA");
  await page
    .getByRole("button", { name: "Salvar política do programa" })
    .click();
  await expect(page.getByLabel("Motivo da política do programa")).toHaveValue(
    "",
  );
  await page.getByRole("button", { name: "Acessos", exact: true }).click();
  await page.getByRole("button", { name: "Provisionar identidade" }).click();
  dialog = page.getByRole("dialog");
  const email = `qa-${Date.now()}@test.local`;
  await dialog.getByLabel("Nome da identidade").fill("Identidade QA isolada");
  await dialog.getByLabel("E-mail para provisionar").fill(email);
  await dialog
    .getByLabel("Senha inicial da identidade")
    .fill("QA-Temporary-Test-2026!");
  await dialog
    .getByLabel("Justificativa do provisionamento")
    .fill("Verificar provisionamento sem concessão implícita");
  await dialog.getByRole("button", { name: "Criar identidade" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Atribuir acesso" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("E-mail da identidade").fill(email);
  await dialog.getByLabel("Papel do vínculo").selectOption("VIEWER");
  await dialog
    .getByLabel("Justificativa do vínculo")
    .fill("Leitura temporária de dados fictícios");
  await dialog.getByRole("button", { name: "Salvar acesso" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: new RegExp(email) }),
  ).toBeVisible();
  const token = await post("access/tokens", {
    name: "QA read token",
    programIds: [pid],
    access: "READ",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  const headers = { Authorization: `Bearer ${token.token}` };
  expect(
    (
      await page.request.get(`/api/v1/deliverables?programId=${pid}`, {
        headers,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(`/api/v1/snapshots?programId=${pid}`, {
        headers,
        data: {},
      })
    ).status(),
  ).toBe(403);
  await post(`access/tokens/${token.id}/revoke`, {});
  expect(
    (
      await page.request.get(`/api/v1/state?programId=${pid}`, { headers })
    ).status(),
  ).toBe(401);
  expect(
    (await new AxeBuilder({ page }).include(".access-workspace").analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/implementation/completion-administration.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Integrações", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "GitLab", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Confluence", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/implementation/completion-integrations.png",
    fullPage: true,
  });

  // A larger inventory exercises bounded DOM rows and the keyboard-friendly paged alternative.
  for (let i = 0; i < 105; i++)
    await post("capabilities", {
      code: `LCAP-${i}`,
      name: `Feature de escala ${i}`,
      domainId: domain.id,
    });
  const largeCSV =
    "program_code,domain_code,workstream_code,capability_code,deliverable_code,name,layer,owner_email\n" +
    Array.from(
      { length: 105 },
      (_, i) =>
        `${project.code},ASYNC,${state.workstreams[0].code},LCAP-${i},LARGE-${i},Entrega de escala ${i},BACKEND,admin@demo.local`,
    ).join("\n");
  const preview = await post("import-jobs", {
    filename: "escala.csv",
    contentBase64: Buffer.from(largeCSV).toString("base64"),
  });
  let previewDone: any;
  await expect
    .poll(
      async () => {
        previewDone = await (
          await page.request.get(`/api/v1/jobs/${preview.id}?programId=${pid}`)
        ).json();
        return previewDone.status;
      },
      { timeout: 30000 },
    )
    .toBe("SUCCEEDED");
  expect(previewDone.output.valid).toBe(true);
  const commit = await post(`import-jobs/${preview.id}/commit`, {
    expectedHash: previewDone.output.hash,
  });
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/v1/jobs/${commit.id}?programId=${pid}`)
          ).json()
        ).status,
      { timeout: 30000 },
    )
    .toBe("SUCCEEDED");
  await page
    .getByRole("button", { name: "Atualizar dados", exact: true })
    .click();
  await page.getByRole("button", { name: "Prioridades", exact: true }).click();
  await expect(page.locator(".priority-virtual-scroll")).toBeVisible();
  expect(await page.locator(".priority-row").count()).toBeLessThan(25);
  await page
    .locator(".priority-virtual-scroll")
    .evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect(page.getByText(/exibindo 9[0-9]–107/)).toBeVisible();
  await page
    .getByRole("button", { name: "Modo paginado", exact: true })
    .click();
  await expect(page.locator(".priority-row")).toHaveCount(25);
  await page.getByRole("button", { name: "Próxima", exact: true }).click();
  await page
    .getByRole("button", { name: "Mapa de capacidades", exact: true })
    .click();
  await expect(page.locator(".matrix-virtual-scroll")).toBeVisible();
  expect(
    await page.locator(".capability-matrix tbody tr").count(),
  ).toBeLessThan(40);
  await page
    .getByRole("button", { name: "Modo paginado", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Próxima", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "docs/implementation/completion-scale.png",
    fullPage: true,
  });
  const ready = await page.request.get("/api/health/ready");
  expect(ready.status()).toBe(200);
  expect(report.payload_hash).toHaveLength(64);
}
