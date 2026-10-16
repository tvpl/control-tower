import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("IA e tutorial GitLab: Orange, Grafite, Claro, leitor e mobile", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("leitor@demo.local");
  await page.getByRole("button", { name: "Acessar plataforma" }).click();
  await page
    .getByRole("button", { name: "Trabalhar com IA", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Validar e ver alterações" }),
  ).toBeDisabled();
  for (const theme of ["orange", "dark", "light"]) {
    await page.getByLabel("Tema visual").selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    expect(
      (await new AxeBuilder({ page }).include(".agent-workspace").analyze())
        .violations,
    ).toEqual([]);
    if (theme === "orange")
      await page.screenshot({
        path: "docs/implementation/agent-orange.png",
        fullPage: true,
      });
  }
  await page.getByLabel("Tema visual").selectOption("orange");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/implementation/agent-orange-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page.getByRole("button", { name: "Integrações", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Configurar GitLab", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Como conectar o GitLab" }).click();
  await expect(page.getByRole("dialog")).toContainText("read_api");
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
