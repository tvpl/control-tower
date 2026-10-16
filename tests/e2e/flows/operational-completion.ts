import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
/** Reuses the existing administrator session; all records belong to disposable QA. */
export async function verifyOperationalCompletion(page: Page) {
  const origin = new URL(page.url()).origin,
    pid = await page.getByLabel("Programa atual").inputValue();
  async function state() {
    return await (
      await page.request.get(`/api/v1/state?programId=${pid}`)
    ).json();
  }
  async function post(path: string, data: unknown) {
    return page.request.post(`/api/v1/${path}?programId=${pid}`, {
      headers: { Origin: origin, "Idempotency-Key": crypto.randomUUID() },
      data,
    });
  }
  let s = await state();
  const prefix = `EVO-${Date.now()}`;
  const created: { id: string; code: string }[] = [];
  for (const code of [`${prefix}-A`, `${prefix}-B`]) {
    const r = await post("deliverables", {
      code,
      name: `Entrega operacional ${code.at(-1)}`,
      workstream_id: s.workstreams[0].id,
      layer: "BACKEND",
      deliverable_type: "API",
      forecast_date: "2028-05-01",
    });
    expect(r.ok()).toBe(true);
    created.push(await r.json());
  }
  await page.reload();
  await page.locator('aside [data-destination="deliverables"]').click();
  await page.getByLabel("Tema visual").selectOption("orange");
  await page.getByLabel("Buscar entregáveis").fill(prefix);
  await expect(page.locator(".deliverable-selection tbody tr")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Selecionar recorte", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Editar em lote", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Editar entregáveis em lote",
    exact: true,
  });
  await dialog.getByLabel("Novo valor 1", { exact: true }).fill("2028-06-01");
  await dialog
    .getByRole("button", { name: "Adicionar campo", exact: true })
    .click();
  await dialog.getByLabel("Campo 2", { exact: true }).selectOption("owner_id");
  await dialog
    .getByLabel("Novo valor 2", { exact: true })
    .selectOption(s.users[0].id);
  await dialog
    .getByLabel("Justificativa do lote")
    .fill("Forecast e responsabilidade confirmados no planejamento");
  await dialog
    .getByRole("button", { name: "Validar lote", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Confira antes de aplicar" }),
  ).toBeVisible();
  s = await state();
  expect(
    s.deliverables
      .filter((d: any) => created.some((c) => c.id === d.id))
      .every((d: any) => d.forecast_date === "2028-05-01"),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/implementation/bulk-review-orange.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Aplicar 2 alterações", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".deliverable-selection tbody tr")).toHaveCount(2);
  s = await state();
  const selected = s.deliverables.filter((d: any) =>
    created.some((c) => c.id === d.id),
  );
  expect(
    selected.every(
      (d: any) =>
        d.forecast_date === "2028-06-01" &&
        d.owner_id === s.users[0].id &&
        !d.accepted,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Selecionar recorte", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Planejar datas", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Planejar datas em lote",
    exact: true,
  });
  await dialog.getByLabel("Deslocamento em dias").fill("7");
  await dialog
    .getByLabel("Justificativa do lote")
    .fill("Replanejamento em sete dias, sem mudar baseline");
  await dialog
    .getByRole("button", { name: "Validar lote", exact: true })
    .click();
  await expect(dialog.locator(".batch-field-diff ins").first()).toHaveText(
    "2028-06-08",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([]);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: "docs/implementation/planning-review-mobile.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Aplicar 2 alterações", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.reload();
  await expect(page.locator(".deliverable-selection tbody tr")).toHaveCount(2);
  s = await state();
  expect(
    s.deliverables
      .filter((d: any) => created.some((c) => c.id === d.id))
      .every((d: any) => d.forecast_date === "2028-06-08" && !d.accepted),
  ).toBe(true);

  await page
    .getByRole("button", { name: "IA desta visão", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "IA contextual · Entregáveis",
    exact: true,
  });
  await dialog.getByLabel("Objetivo da IA contextual").selectOption("PLAN");
  await dialog
    .getByRole("button", { name: "Preparar recorte para IA", exact: true })
    .click();
  await expect(
    dialog.locator(".context-agent-metrics article").first(),
  ).toContainText("2");
  const downloadPromise = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Baixar pacote do recorte", exact: true })
    .click();
  const downloaded = await downloadPromise;
  const pack = JSON.parse(await readFile((await downloaded.path())!, "utf8"));
  expect(new Set(pack.focus.deliverableIds)).toEqual(
    new Set(created.map((d) => d.id)),
  );
  expect(pack.context.deliverables.length).toBeGreaterThan(2);
  expect(pack.focus.intent).toBe("PLAN");
  expect(pack.template.changes).toHaveLength(2);
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/implementation/context-agent-orange.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/implementation/context-agent-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  const template = {
    ...pack.template,
    changes: [
      {
        ...pack.template.changes[0],
        action: "UPDATE",
        values: { forecast_date: "2028-07-02" },
        reason: "Sugestão revisada no contexto do planejamento",
      },
    ],
  };
  await dialog
    .getByRole("button", { name: "Trazer preenchimento", exact: true })
    .click();
  await dialog
    .getByLabel("Template preenchido", { exact: true })
    .fill(JSON.stringify(template));
  await dialog
    .getByRole("button", { name: "Validar e ver alterações", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Aplicar 1 alteração revisada", exact: true })
    .click();
  await expect(dialog).toContainText("Preenchimento aplicado e auditado.");
  await dialog
    .getByRole("button", { name: "Fechar painel", exact: true })
    .click();
  await page.locator(".table-wrap tbody .row-link").first().click();
  const detail = page.getByRole("dialog");
  await detail
    .getByRole("button", { name: "IA deste registro", exact: true })
    .click();
  const contextual = page.getByRole("dialog").filter({
    has: page.getByRole("button", {
      name: "Preparar recorte para IA",
      exact: true,
    }),
  });
  await contextual
    .getByRole("button", { name: "Preparar recorte para IA", exact: true })
    .click();
  await expect(
    contextual.locator(".context-agent-metrics article").first(),
  ).toContainText("1");
  await contextual
    .getByRole("button", { name: "Fechar painel", exact: true })
    .click();
  await expect(
    detail.getByRole("button", { name: "IA deste registro", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");

  await page.locator('aside [data-destination="delivery"]').click();
  await expect(
    page.getByRole("heading", {
      name: "Planejamento operacional",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Sem forecast/ }).click();
  await expect(
    page.locator(".planning-workspace .table-wrap tbody tr"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^Todas/ }).click();
  await expect(
    page.locator(".planning-workspace .table-wrap tbody tr"),
  ).toHaveCount(2);

  const configured = await post("connections", {
    name: `GitLab ${prefix}`,
    connector_type: "GITLAB",
    base_url: "https://gitlab.com",
    project: "qa/synthetic",
    secret_env: "MCT_CONNECTOR_E2E_ABSENT",
    execution_owner: "EXTERNAL",
  });
  expect(configured.ok()).toBe(true);
  const connection = await configured.json();
  await page.reload();
  await page.locator('aside [data-destination="integrations"]').click();
  const card = page.locator(".integration-workspace .contract-card").filter({
    has: page.getByRole("button", { name: `GitLab ${prefix}`, exact: true }),
  });
  await card
    .getByRole("button", { name: "Vincular em lote", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Vincular GitLab em lote",
    exact: true,
  });
  await dialog
    .getByText("Colar uma lista de vínculos por código", { exact: true })
    .click();
  await dialog
    .getByLabel("Lista de vínculos CSV", { exact: true })
    .fill(
      `external_id;codigo;modo\ngid://gitlab/WorkItem/9000001;${created[0].code};REFERENCE\ngid://gitlab/WorkItem/9000002;ESCOLHER-MANUAL;EXECUTION\n`,
    );
  await dialog
    .getByRole("button", { name: "Montar lista do CSV", exact: true })
    .click();
  await expect(dialog.locator(".gitlab-link-row")).toHaveCount(2);
  await dialog
    .getByRole("button", { name: "Escolher destino do vínculo 2", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Escolher registro da torre",
    exact: true,
  });
  await picker.getByLabel("Buscar registro da torre").fill(created[1].code);
  await picker.locator(".record-picker-result").first().click();
  await expect(picker).toHaveCount(0);
  await expect(
    dialog.getByRole("button", {
      name: "Escolher destino do vínculo 2",
      exact: true,
    }),
  ).toBeFocused();
  await dialog
    .getByLabel("Justificativa dos vínculos", { exact: true })
    .fill("Vínculos de QA revisados manualmente");
  await dialog
    .getByRole("button", { name: "Validar vínculos", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", {
      name: "Confira antes de aplicar",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await dialog.locator(".gitlab-link-list").evaluate((el) => el.clientHeight),
  ).toBeGreaterThan(80);
  await dialog.locator(".gitlab-link-list").scrollIntoViewIfNeeded();
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/implementation/gitlab-batch-orange.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/implementation/gitlab-batch-mobile.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Aplicar 2 vínculos", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const status = await (
    await page.request.get(`/api/v1/integrations/status?programId=${pid}`)
  ).json();
  expect(
    status.references.filter((r: any) => r.connection_id === connection.id),
  ).toHaveLength(2);
  expect(
    (await state()).deliverables
      .filter((d: any) => created.some((c) => c.id === d.id))
      .every((d: any) => !d.accepted),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1100 });
}
