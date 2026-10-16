import { verifyWorkspaceExperience } from "./flows/workspace-experience";
import { verifyOperationalCompletion } from "./flows/operational-completion";
import { verifyAgentNavigation } from "./flows/agent-navigation";
import { test, expect } from "@playwright/test";
const origin = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
import AxeBuilder from "@axe-core/playwright";
test("Login, mapa, CRUD persistente, drawer, snapshot, mobile e temas", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/login");
  await page.getByRole("button", { name: "Acessar plataforma" }).click();
  await expect(
    page.getByRole("heading", { name: "Visão executiva", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Projeto → features" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/implementation/overview-desktop.png",
    fullPage: true,
  });
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page
    .getByRole("button", { name: "Mapa de capacidades", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mapa de capacidades", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nova capacidade" }).click();
  const dialog = page.getByRole("dialog");
  const code = `E2E-${Date.now()}`;
  await dialog.getByLabel("Código").fill(code);
  await dialog
    .getByLabel("Nome", { exact: false })
    .fill("Capacidade criada em teste E2E");
  await dialog.getByLabel("Domínio").selectOption({ label: "Autorização" });
  await dialog
    .getByLabel("Critérios de aceite")
    .fill("Comprovar persistência após recarregar");
  await dialog.getByRole("button", { name: "Salvar registro" }).click();
  await expect(
    page.getByText("Registro salvo e alteração auditada."),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("textbox", { name: "Buscar capacidade" }).fill(code);
  await page
    .getByRole("button", { name: new RegExp(code + " Capacidade") })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Comprovar persistência após recarregar",
  );
  await page.getByRole("button", { name: "Fechar painel" }).click();
  await page.getByRole("textbox", { name: "Buscar capacidade" }).fill("");
  await page
    .getByRole("button", { name: "Autorizar transação, Parceiros" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Contrato parceiro");
  await page.getByRole("button", { name: /AUT-011.*Contrato/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Gates de prontidão");
  await page.getByRole("button", { name: "Fechar painel" }).click();
  await page.getByRole("button", { name: "Relatórios", exact: true }).click();
  await page.getByRole("button", { name: "Criar snapshot" }).click();
  await expect(page.getByText("Snapshot imutável criado.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /\d\d\/\d\d\/\d{4}/ }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Alternar tema" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const light = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(light.violations).toEqual([]);
  await page.screenshot({
    path: "docs/implementation/reports-light.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page
    .getByRole("button", { name: "Visão executiva", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Visão executiva" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/implementation/overview-mobile.png",
    fullPage: true,
  });
  await verifyAgentNavigation(page);
  await verifyWorkspaceExperience(page);
  await verifyOperationalCompletion(page);
});
test("Leitor não edita e requisição sem identidade é rejeitada", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/v1/programs")).status()).toBe(401);
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("leitor@demo.local");
  await page.getByRole("button", { name: "Acessar plataforma" }).click();
  await page.getByRole("button", { name: "Entregáveis", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Novo registro" }),
  ).toBeDisabled();
  const programs = await page.request.get("/api/v1/programs");
  const pid = (await programs.json()).items[0].id;
  const forbidden = await page.request.post(
    `/api/v1/domains?programId=${pid}`,
    {
      headers: { Origin: origin },
      data: { code: "FORBIDDEN", name: "Acesso proibido" },
    },
  );
  expect(forbidden.status()).toBe(403);
  await expect(page.locator(".selection-toolbar")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "IA desta visão", exact: true }),
  ).toBeEnabled();
});
