import { completionJourney } from "./flows/completion";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const origin = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
test("criação de projeto/frente Spike/área/squad, filtros combinados e modais amplos", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.getByRole("button", { name: "Acessar plataforma" }).click();
  await page.getByRole("button", { name: "Projetos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Projetos", exact: true }),
  ).toBeVisible();
  const name = `Projeto E2E frentes ${Date.now()}`,
    code = `PROJ-${Date.now()}`;
  await page.getByRole("button", { name: "Novo projeto", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Código").fill(code);
  await dialog.getByLabel("Nome", { exact: false }).fill(name);
  const created = page.waitForResponse(
    (r) =>
      r.url().includes("/api/v1/programs?") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Salvar registro" }).click();
  const project = await (await created).json();
  await page
    .getByRole("button", { name: `Ampliar projeto ${name}`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Aceite · 0/0");
  expect((await page.getByRole("dialog").boundingBox())!.width).toBeGreaterThan(
    850,
  );
  await page
    .getByRole("button", { name: "Abrir cockpit", exact: false })
    .click();
  await expect(page.getByLabel("Programa atual")).toHaveValue(project.id);
  await page
    .getByRole("button", { name: "Administração", exact: true })
    .click();
  await page.getByRole("button", { name: "Frentes", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo registro", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Código").fill("SPIKE");
  await dialog
    .getByLabel("Nome", { exact: false })
    .fill("Investigação de integração");
  await dialog.getByLabel("Tipo da frente").selectOption("SPIKE");
  await dialog.getByRole("button", { name: "Salvar registro" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Áreas", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo registro", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Código").fill("BUSINESS");
  await dialog.getByLabel("Nome", { exact: false }).fill("Negócio E2E");
  await dialog.getByRole("button", { name: "Salvar registro" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Squads", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo registro", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Código").fill("CHECKOUT");
  await dialog.getByLabel("Nome", { exact: false }).fill("Checkout E2E");
  await dialog
    .getByRole("combobox", { name: "Área", exact: true })
    .selectOption({ label: "Negócio E2E" });
  await dialog.getByRole("button", { name: "Salvar registro" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Entregáveis", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo registro", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Código").fill("SPIKE-ONE");
  await dialog
    .getByLabel("Nome", { exact: false })
    .fill("Investigar contrato de integração");
  await dialog
    .getByLabel("Frente", { exact: false })
    .selectOption({ label: "Investigação de integração" });
  await dialog
    .getByRole("combobox", { name: "Squad", exact: true })
    .selectOption({ label: "Checkout E2E" });
  await dialog.getByLabel("Camada").selectOption("QUALITY");
  await dialog.getByLabel("Tipo de entrega").selectOption("DOCUMENTATION");
  await dialog
    .getByLabel("Obrigação transversal", { exact: false })
    .fill("Investigar contrato do parceiro");
  await dialog.getByRole("button", { name: "Salvar registro" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Visão executiva", exact: true })
    .click();
  await page
    .getByLabel("Filtrar por frente")
    .selectOption({ label: "Investigação de integração" });
  await page
    .getByLabel("Filtrar por área")
    .selectOption({ label: "Negócio E2E" });
  await page
    .getByLabel("Filtrar por squad")
    .selectOption({ label: "Checkout E2E" });
  await expect(page.locator(".ct-kpi").first()).toContainText("0/1");
  const areaId = await page.getByLabel("Filtrar por área").inputValue(),
    squadId = await page.getByLabel("Filtrar por squad").inputValue();
  const filtered = await page.request.get(
    `/api/v1/deliverables?programId=${project.id}&areaId=${areaId}&squadId=${squadId}`,
  );
  expect(filtered.status()).toBe(200);
  expect((await filtered.json()).items).toHaveLength(1);
  await page.locator(".ct-kpi").first().click();
  await expect(
    page.getByRole("dialog", { name: "Aceite", exact: true }),
  ).toBeVisible();
  expect((await page.getByRole("dialog").boundingBox())!.width).toBeGreaterThan(
    850,
  );
  await page.getByRole("button", { name: "Fechar painel" }).click();
  await page
    .getByRole("button", { name: "Ampliar Aceite das entregas", exact: true })
    .click();
  await expect(page.locator(".ct-expanded-chart")).toBeVisible();
  await expect(page.locator(".ct-expanded-records")).toContainText(
    "Investigar contrato de integração",
  );
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.locator(".ct-expanded-records button").first().click();
  await expect(page.getByRole("dialog")).toContainText(
    "Negócio E2E (do squad)",
  );
  await page.getByRole("button", { name: "Ampliar detalhes" }).click();
  expect((await page.getByRole("dialog").boundingBox())!.width).toBeGreaterThan(
    850,
  );
  await page.getByRole("button", { name: "Fechar painel" }).click();
  await page
    .getByRole("button", { name: "Readiness & gates", exact: true })
    .click();
  await expect(page.locator(".readiness-table tbody tr")).toHaveCount(1);
  await page.getByLabel("Filtrar por área").selectOption("__unassigned__");
  await expect(page.locator(".readiness-table tbody tr")).toHaveCount(0);
  await page.getByRole("button", { name: "Prioridades", exact: true }).click();
  await expect(page.locator(".priority-row")).toHaveCount(0);
  await page
    .getByLabel("Filtrar por área")
    .selectOption({ label: "Negócio E2E" });
  await expect(page.locator(".priority-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Salvar filtros" }).click();
  await page.getByLabel("Nome da visão").fill("Spike por área e squad");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar filtros", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await page
    .getByLabel("Visões salvas")
    .selectOption({ label: "Spike por área e squad" });
  await expect(page.getByLabel("Filtrar por área")).toHaveValue(areaId);
  await page.getByRole("button", { name: "Projetos", exact: true }).click();
  await page.getByLabel("Filtrar projetos").selectOption(project.id);
  await page.getByLabel("Tipo de frente no portfólio").selectOption("SPIKE");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await expect(page.locator(".project-card")).toContainText(
    "Investigação de integração",
  );
  await page.screenshot({
    path: "docs/implementation/projects-desktop.png",
    fullPage: true,
  });
  const portfolioAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(portfolioAxe.violations).toEqual([]);
  await page
    .getByRole("button", { name: `Ampliar projeto ${name}`, exact: true })
    .click();
  await page.screenshot({
    path: "docs/implementation/project-expanded.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Fechar painel" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/implementation/projects-mobile.png",
    fullPage: true,
  });
  await completionJourney(page, project);
  expect(errors).toEqual([]);
});
test("leitor consulta portfólio sem acesso a projetos alheios ou cadastro de áreas/squads", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("leitor@demo.local");
  await page.getByRole("button", { name: "Acessar plataforma" }).click();
  await page.getByRole("button", { name: "Projetos", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Novo projeto", exact: true }),
  ).toBeDisabled();
  const portfolio = await (await page.request.get("/api/v1/projects")).json();
  expect(portfolio.items).toHaveLength(1);
  expect(portfolio.items[0].name).toBe("Modernização da adquirência");
  const rejected = await page.request.post(
    `/api/v1/areas?programId=${portfolio.items[0].id}`,
    {
      headers: { Origin: origin },
      data: { code: "DENIED", name: "Negado ao leitor" },
    },
  );
  expect(rejected.status()).toBe(403);
});
