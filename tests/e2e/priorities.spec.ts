import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const origin = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
test("prioridades: arrastar, teclado, filtros, persistência, contexto e design responsivo", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.getByRole("button", { name: "Acessar plataforma" }).click();
  await expect(
    page.getByRole("button", {
      name: /Definir prioridades|Revisar prioridades/,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Prioridades", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Prioridades", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".priority-row").first()).toBeVisible();
  const pid = (await (await page.request.get("/api/v1/programs")).json())
    .items[0].id;
  const inventory = await (
    await page.request.get(`/api/v1/state?programId=${pid}`)
  ).json();
  const before = await (
    await page.request.get(`/api/v1/priorities?programId=${pid}`)
  ).json();
  const first = page.locator(".priority-row").nth(0),
    second = page.locator(".priority-row").nth(1);
  const firstId = await first.getAttribute("data-priority-id"),
    secondId = await second.getAttribute("data-priority-id");
  await second.locator(".priority-grip").dragTo(first);
  await expect(page.locator(".priority-row").first()).toHaveAttribute(
    "data-priority-id",
    secondId!,
  );
  await expect(
    page.getByText("Alterações não salvas", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Visão executiva", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Visão executiva", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Prioridades", exact: true }).click();
  await expect(page.locator(".priority-row").first()).toHaveAttribute(
    "data-priority-id",
    secondId!,
  );
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.locator(".priority-row").first()).toHaveAttribute(
    "data-priority-id",
    firstId!,
  );
  const grip = page.locator(".priority-row").nth(1).locator(".priority-grip");
  await grip.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.locator(".priority-row").first()).toHaveAttribute(
    "data-priority-id",
    secondId!,
  );
  await page
    .getByLabel("Nota da priorização")
    .fill("Prioridade reorganizada por dependência e impacto na entrega");
  const savedResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/priorities/reorder") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Salvar prioridades", exact: true })
    .click();
  expect((await savedResponse).status()).toBe(200);
  await expect(page.getByText("Ordem salva", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".priority-row").first()).toHaveAttribute(
    "data-priority-id",
    secondId!,
  );
  const persisted = await (
    await page.request.get(`/api/v1/priorities?programId=${pid}`)
  ).json();
  expect(persisted.deliverables.orderedIds[0]).toBe(secondId);
  const old = await page.request.post(
    `/api/v1/priorities/reorder?programId=${pid}`,
    {
      headers: { Origin: origin, "Idempotency-Key": crypto.randomUUID() },
      data: {
        kind: "deliverables",
        orderedIds: before.deliverables.orderedIds,
        expectedVersion: before.deliverables.version,
        universeHash: before.deliverables.universeHash,
        reason: "Não sobrescrever outra decisão",
      },
    },
  );
  expect(old.status()).toBe(409);
  await page.getByRole("button", { name: "Abrir contexto completo" }).click();
  await expect(page.getByRole("dialog")).toContainText("Gates de prontidão");
  await page.getByRole("button", { name: "Fechar painel" }).click();
  await page
    .getByLabel("Filtrar por frente")
    .selectOption({ label: "Plataforma core" });
  const visibleIds = await page
    .locator(".priority-row")
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-priority-id")));
  const filteredSecond = page.locator(".priority-row").nth(1);
  const promoted = await filteredSecond.getAttribute("data-priority-id");
  await filteredSecond.getByRole("button", { name: /para o topo/ }).click();
  const saved2 = page.waitForResponse(
    (r) =>
      r.url().includes("/priorities/reorder") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Salvar prioridades", exact: true })
    .click();
  await saved2;
  const afterFiltered = await (
    await page.request.get(`/api/v1/priorities?programId=${pid}`)
  ).json();
  const hidden = persisted.deliverables.orderedIds.filter(
    (id: string) => !visibleIds.includes(id),
  );
  for (const id of hidden)
    expect(afterFiltered.deliverables.orderedIds.indexOf(id)).toBe(
      persisted.deliverables.orderedIds.indexOf(id),
    );
  expect(
    afterFiltered.deliverables.orderedIds.filter((id: string) =>
      visibleIds.includes(id),
    )[0],
  ).toBe(promoted);
  await page.getByLabel("Filtrar por frente").selectOption("");
  await expect(page.locator(".priority-row")).toHaveCount(
    inventory.deliverables.length,
  );
  const manualIds = await page
    .locator(".priority-row")
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-priority-id")));
  await page
    .getByRole("button", { name: "Ordenar por impacto", exact: true })
    .click();
  await expect(page.locator(".priority-row").first()).toContainText("AUT-011");
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect(
    await page
      .locator(".priority-row")
      .evaluateAll((rows) =>
        rows.map((r) => r.getAttribute("data-priority-id")),
      ),
  ).toEqual(manualIds);
  const dark = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(dark.violations).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/implementation/priorities-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Alternar tema" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const light = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(light.violations).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/implementation/priorities-light.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Capacidades", exact: true }).click();
  await expect(page.locator(".priority-row")).toHaveCount(
    inventory.capabilities.length,
  );
  await page
    .locator(".priority-row")
    .nth(1)
    .getByRole("button", { name: /para o topo/ })
    .click();
  const capSaved = page.waitForResponse(
    (r) =>
      r.url().includes("/priorities/reorder") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Salvar prioridades", exact: true })
    .click();
  expect((await capSaved).status()).toBe(200);
  await page.getByRole("tab", { name: "Entregáveis", exact: true }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar ordem" }).click();
  expect((await dl).suggestedFilename()).toBe("prioridades-deliverables.json");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  const mobileFirst = await page
    .locator(".priority-row")
    .first()
    .getAttribute("data-priority-id");
  await page
    .locator(".priority-row")
    .nth(1)
    .getByRole("button", { name: /para o topo/ })
    .click();
  await expect(page.locator(".priority-row").first()).not.toHaveAttribute(
    "data-priority-id",
    mobileFirst!,
  );
  await page.getByRole("button", { name: "Restaurar", exact: true }).click();
  await expect(page.locator(".priority-row").first()).toHaveAttribute(
    "data-priority-id",
    mobileFirst!,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/implementation/priorities-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("leitor explora prioridades mas não pode alterar a ordem pela API", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("leitor@demo.local");
  await page.getByLabel("Senha").fill("Tower-Demo-2026!");
  await page.getByRole("button", { name: "Acessar plataforma" }).click();
  await page.getByRole("button", { name: "Prioridades", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Prioridades", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Salvar prioridades", exact: true }),
  ).toHaveCount(0);
  const pid = (await (await page.request.get("/api/v1/programs")).json())
    .items[0].id;
  const boards = await (
    await page.request.get(`/api/v1/priorities?programId=${pid}`)
  ).json();
  const denied = await page.request.post(
    `/api/v1/priorities/reorder?programId=${pid}`,
    {
      headers: { Origin: origin, "Idempotency-Key": crypto.randomUUID() },
      data: {
        kind: "deliverables",
        orderedIds: boards.deliverables.orderedIds,
        expectedVersion: boards.deliverables.version,
        universeHash: boards.deliverables.universeHash,
        reason: "Leitor não deve reordenar",
      },
    },
  );
  expect(denied.status()).toBe(403);
});
