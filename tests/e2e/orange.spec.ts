import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("Tema Orange: identidade do sistema, indicadores, filtros, expansão e mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.getByRole("button", { name: "Acessar plataforma" }).click();
  await page.getByLabel("Tema visual").selectOption("orange");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "orange");
  await expect(
    page.getByRole("heading", { name: "Visão executiva", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Modernization Control Tower");
  await expect(
    page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("button", { name: "Orange", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    /Banco Inter|Inter&Co|bancointer/i,
  );
  await expect(page.locator(".ct-kpi").first()).toBeVisible();
  const pid = await page.getByLabel("Programa atual").inputValue(),
    data = await (
      await page.request.get(`/api/v1/state?programId=${pid}`)
    ).json();
  await expect(page.locator(".ct-kpi").first()).toContainText(
    `${data.deliverables.filter((d: any) => d.accepted).length}/${data.deliverables.length}`,
  );
  await expect(page.locator(".ct-flow-node").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Radar de atenção", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ver tudo", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Radar de atenção", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar painel" }).click();
  await page
    .getByLabel("Filtrar por responsável")
    .selectOption("__unassigned__");
  const unowned = data.deliverables.filter((d: any) => !d.owner_id);
  await expect(page.locator(".ct-kpi").first()).toContainText(
    `/${unowned.length} entregáveis`,
  );
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({
    path: "docs/implementation/orange-firstfold.png",
    fullPage: false,
  });
  await page.screenshot({
    path: "docs/implementation/orange-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Ampliar Aceite das entregas", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Aceite das entregas", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ct-expanded-records button")).toHaveCount(
    data.deliverables.length,
  );
  const modalAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(modalAxe.violations).toEqual([]);
  await page.screenshot({
    path: "docs/implementation/orange-expanded.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Fechar painel" }).click();
  await page
    .getByLabel("Filtrar por frente")
    .selectOption(data.workstreams[0].id);
  await expect(page.locator(".ct-kpi").first()).toContainText(
    `/${data.deliverables.filter((d: any) => d.workstream_id === data.workstreams[0].id).length} entregáveis`,
  );
  await expect(page.locator(".ct-kpi").nth(1)).toContainText(
    "gates no recorte",
  );
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Revisar prioridades", exact: true })
    .or(page.getByRole("button", { name: "Definir prioridades", exact: true }))
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "orange");
  await expect(page.locator(".priority-row").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Visão executiva", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Visão executiva", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "orange");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page.getByRole("button", { name: "Projetos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Projetos", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page
    .getByRole("button", { name: "Visão executiva", exact: true })
    .click();
  await expect(page.getByLabel("Tema visual")).toBeVisible();
  await page.getByLabel("Tema visual").selectOption("light");
  await expect(page).toHaveTitle("Modernization Control Tower");
  await page.getByLabel("Tema visual").selectOption("orange");
  await page.screenshot({
    path: "docs/implementation/orange-mobile.png",
    fullPage: true,
  });
  const mobileAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(mobileAxe.violations).toEqual([]);
  expect(errors).toEqual([]);
});
