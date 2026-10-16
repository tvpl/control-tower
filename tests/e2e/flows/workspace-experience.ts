import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function expectCardContentToFit(page: Page) {
  expect(
    await page.locator(".front-card").evaluateAll(
      (cards) =>
        cards.length > 0 &&
        cards.every((card) => {
          const outer = card.getBoundingClientRect();
          return [...card.querySelectorAll("*")].every((child) => {
            const rect = child.getBoundingClientRect();
            return rect.left >= outer.left - 1 && rect.right <= outer.right + 1;
          });
        }),
    ),
  ).toBe(true);
}
export async function verifyWorkspaceExperience(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const sidebar = page.locator("aside.workspace-sidebar");
  await page
    .getByRole("button", { name: "Recolher navegação", exact: true })
    .click();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-navigation",
    "collapsed",
  );
  expect((await sidebar.boundingBox())!.width).toBe(76);
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-navigation",
    "collapsed",
  );
  await page
    .getByRole("button", { name: "Expandir navegação", exact: true })
    .click();
  expect((await sidebar.boundingBox())!.width).toBe(248);
  await expect(
    sidebar.locator('[data-destination="fronts"] .nav-item-name'),
  ).toBeVisible();
  await page.getByLabel("Densidade da visão").selectOption("comfortable");
  await page.reload();
  await expect(page.getByLabel("Densidade da visão")).toHaveValue(
    "comfortable",
  );
  await page.getByLabel("Densidade da visão").selectOption("compact");
  await page.getByRole("link", { name: "Frentes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Frentes do projeto", exact: true }),
  ).toBeVisible();
  const pid = await page.getByLabel("Programa atual").inputValue();
  const s = await (
    await page.request.get(`/api/v1/state?programId=${pid}`)
  ).json();
  await expect(page.locator(".front-card")).toHaveCount(s.workstreams.length);
  const front = s.workstreams[0];
  const ds = s.deliverables.filter((d: any) => d.workstream_id === front.id);
  await expect(
    page.locator(".front-card").first().locator(".front-acceptance strong"),
  ).toHaveText(
    ds.length
      ? `${Math.round((ds.filter((d: any) => d.accepted).length / ds.length) * 100)}%`
      : "—",
  );
  await page.getByRole("button", { name: "Nova frente", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("Tipo da frente"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("Tema visual").selectOption("orange");
  await expectCardContentToFit(page);
  await expect(
    sidebar.locator('[data-destination="fronts"] .nav-item-name'),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/implementation/workspace-fronts-orange.png",
    fullPage: true,
  });
  await page
    .locator(".front-card")
    .first()
    .getByRole("button", { name: "Ver entregas" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Entregáveis", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Filtrar por frente")).toHaveValue(front.id);
  await expect(page.locator(".active-filter-bar")).toContainText(front.name);
  await page.reload();
  await expect(page.getByLabel("Filtrar por frente")).toHaveValue(front.id);
  await page
    .getByRole("button", { name: "Recolher filtros", exact: true })
    .click();
  await expect(page.getByLabel("Filtrar por frente")).toHaveCount(0);
  await expect(page.locator(".active-filter-bar")).toContainText(front.name);
  await page
    .getByRole("button", {
      name: `Remover filtro Frente: ${front.name}`,
      exact: true,
    })
    .click();
  await expect(page.locator(".active-filter-bar")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("stream")).toBe(false);
  await page
    .getByRole("button", { name: "Mostrar filtros", exact: true })
    .click();
  await page.getByRole("button", { name: "Entregável", exact: true }).click();
  const codes = await page
    .locator(".table-wrap .record-title .mono")
    .allTextContents();
  await page.locator(".table-wrap tbody .row-link").first().click();
  await expect(page.getByRole("dialog")).toContainText(codes[0]);
  await page
    .getByRole("button", { name: "Próximo registro", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(codes[1]);
  await page
    .getByRole("button", { name: "Registro anterior", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(codes[0]);
  await page
    .getByRole("button", { name: "Ampliar detalhes", exact: true })
    .click();
  expect((await page.getByRole("dialog").boundingBox())!.width).toBeGreaterThan(
    850,
  );
  await page
    .getByRole("button", { name: "Fechar painel", exact: true })
    .click();
  await page.getByRole("link", { name: "Frentes", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectCardContentToFit(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Abrir navegação", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Navegar pelo workspace", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Navegação principal", exact: true })
      .getByRole("button"),
  ).toHaveCount(18);
  await expect(
    page
      .getByRole("dialog")
      .locator('[data-destination="fronts"] .nav-item-name'),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/implementation/workspace-navigation-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Abrir navegação", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: "docs/implementation/workspace-fronts-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Abrir navegação", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator('[data-destination="settings"]')
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Administração", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Abrir navegação", exact: true })
    .click();
  await page.getByRole("dialog").locator('[data-destination="fronts"]').click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByLabel("Tema visual").selectOption("dark");
  await expectCardContentToFit(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "docs/implementation/workspace-fronts-dark.png",
    fullPage: true,
  });
}
