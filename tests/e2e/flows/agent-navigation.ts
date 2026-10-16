import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { VIEWS } from "../../../src/features/tower/navigation";
/** Uses the caller's session so the suite does not increase the login quota. */
export async function verifyAgentNavigation(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const pid = (await (await page.request.get("/api/v1/programs")).json())
    .items[0].id;
  // Every primary menu has distinct content and remains selected after a reload.
  const rail = page.getByRole("navigation", { name: "Navegação principal" });
  for (const view of VIEWS) {
    const button = rail.locator(`button[data-destination="${view}"]`);
    const name = await button.getAttribute("aria-label");
    await button.click();
    await expect(page.locator("main")).toHaveAttribute("data-view", view);
    await expect(
      page.getByRole("heading", { name: name!, exact: true }).first(),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("view")).toBe(view);
  }
  await rail
    .getByRole("button", { name: "Análise e cenários", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Novo registro", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "IA desta visão", exact: true }),
  ).toBeVisible();
  await rail
    .getByRole("button", { name: "Trabalhar com IA", exact: true })
    .click();
  await page.goBack();
  await expect(page.locator("main")).toHaveAttribute(
    "data-view",
    "intelligence",
  );
  await page.goForward();
  await expect(page.locator("main")).toHaveAttribute("data-view", "agents");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Trabalhar com IA", exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar pacote para IA", exact: true })
    .click();
  const file = await downloadPromise;
  expect(file.suggestedFilename()).toBe("pacote-ia.json");
  await page
    .getByRole("button", { name: "Ler relatório do projeto", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Checklist de preenchimento",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const bundle = await (
    await page.request.get(`/api/v1/agents/package?programId=${pid}`)
  ).json();
  expect(bundle.context.connections).toBeUndefined();
  const code = `AGENT-${Date.now()}`;
  const template = {
    ...bundle.template,
    changes: [
      {
        action: "CREATE",
        kind: "capabilities",
        values: {
          code,
          name: "Feature preenchida com template IA",
          domain_id: bundle.context.domains[0].id,
        },
        reason: "Completar inventário com revisão humana",
      },
    ],
  };
  await page
    .getByLabel("Template preenchido", { exact: true })
    .fill(JSON.stringify(template));
  await page.getByRole("button", { name: "Validar e ver alterações" }).click();
  await expect(
    page.getByRole("heading", { name: "Pronto para revisão" }),
  ).toBeVisible();
  expect(
    (
      await (await page.request.get(`/api/v1/state?programId=${pid}`)).json()
    ).capabilities.some((c: any) => c.code === code),
  ).toBe(false);
  await page.screenshot({
    path: "docs/implementation/agent-preview.png",
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).include(".agent-workspace").analyze())
      .violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Aplicar 1 alteração revisada" })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Preenchimento aplicado e auditado" }),
  ).toBeVisible();
  expect(
    (
      await (await page.request.get(`/api/v1/state?programId=${pid}`)).json()
    ).capabilities.some((c: any) => c.code === code),
  ).toBe(true);
  await page.getByLabel("Template preenchido", { exact: true }).fill(
    JSON.stringify({
      ...template,
      changes: [
        {
          action: "UPDATE",
          kind: "deliverables",
          id: bundle.context.deliverables[0].id,
          expectedVersion: 99999,
          values: { forecast_date: "2027-01-01" },
          reason: "Teste de versão antiga",
        },
      ],
    }),
  );
  await page.getByRole("button", { name: "Validar e ver alterações" }).click();
  await expect(page.getByText(/Versão obsoleta/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Aplicar 1 alteração revisada/ }),
  ).toBeDisabled();
  await rail.getByRole("button", { name: "Integrações", exact: true }).click();
  await page.getByRole("button", { name: "Como conectar o GitLab" }).click();
  await expect(page.getByRole("dialog")).toContainText("read_api");
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/implementation/gitlab-tutorial.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Configurar GitLab", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome da conexão").fill("GitLab QA sem credencial");
  await dialog.getByLabel("Escopo GitLab").selectOption("GROUP");
  await dialog.getByLabel("Caminho completo").fill("example/qa");
  await dialog.getByLabel("Labels para selecionar itens").fill("tower::qa");
  await dialog
    .getByRole("button", { name: "Salvar configuração GitLab" })
    .click();
  await expect(dialog).toHaveCount(0);
  const card = page
    .locator(".contract-card")
    .filter({ hasText: "GitLab QA sem credencial" });
  await card
    .getByRole("button", { name: "Testar acesso", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Credencial não configurada" }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Vincular ID externo" }).click();
  dialog = page.getByRole("dialog");
  const options = await dialog
    .getByLabel("Registro da torre")
    .locator("option")
    .allTextContents();
  expect(new Set(options.slice(1)).size).toBeGreaterThan(5);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await rail
    .getByRole("button", { name: "Trabalhar com IA", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Trabalhar com IA", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/implementation/agent-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/?view=does-not-exist&program=${pid}`);
  await expect(
    page.getByRole("heading", { name: "Esta tela não existe" }),
  ).toBeVisible();
  await page.goto(`/?view=raid&program=${pid}`);
  await expect(
    page.getByRole("heading", { name: "Dependências & RAID", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".section-toolbar .selected")).toHaveText(/RAID/);
  await rail
    .getByRole("button", { name: "Visão executiva", exact: true })
    .click();
}
