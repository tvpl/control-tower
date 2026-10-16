import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { verifyVisualManagement } from "./flows/visual-management";
const origin = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
test("dashboard compacto: macro → micro, expansão, grafo, observação persistente e resumo compartilhável", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/login");
  await page.getByRole("button", { name: "Acessar plataforma" }).click();
  await page.getByLabel("Tema visual").selectOption("orange");
  await verifyVisualManagement(page);
  await expect(
    page.getByRole("heading", { name: "Projeto → features" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Macro", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".ct-charts .ct-chart-card")).toHaveCount(3);
  await expect(page.locator(".ct-flow-node").first()).toBeVisible();
  await page.screenshot({
    path: "docs/implementation/cockpit-macro.png",
    fullPage: true,
  });
  const macro = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(macro.violations).toEqual([]);
  await page
    .getByRole("button", { name: "Expandir Autorizar transação", exact: true })
    .click();
  await expect(page.locator(".ct-delivery-row").first()).toBeVisible();
  await page
    .locator(".ct-feature-name")
    .filter({ hasText: "Autorizar transação" })
    .click();
  await expect(
    page.getByRole("button", { name: "Micro", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "Aceite por camada" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/implementation/cockpit-micro.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Ampliar", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Explorar dependências" }),
  ).toBeVisible();
  await expect(
    page.locator(".ct-graph.enlarged .ct-flow-node").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar painel" }).click();
  await page
    .locator(".ct-graph .react-flow__edge-text")
    .first()
    .click({ force: true });
  await expect(
    page.getByRole("dialog", { name: "Dependências desta conexão" }),
  ).toBeVisible();
  await expect(page.locator(".ct-dep-item").first()).toBeVisible();
  await page.getByRole("button", { name: "Fechar painel" }).click();
  await page.getByRole("button", { name: "Anotar na feature" }).click();
  await page
    .getByRole("button", { name: "Nova observação", exact: true })
    .click();
  const title = `Status de homologação ${Date.now()}`;
  await page.getByLabel("Título da observação").fill(title);
  await page
    .getByLabel("Observação", { exact: true })
    .fill(
      "Contrato revisado. Compartilhar a evidência de UAT e confirmar o próximo marco.",
    );
  await page.getByLabel("Marcar como ponto importante").check();
  await page.getByRole("button", { name: "Salvar observação" }).click();
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
  await expect(page.locator(".ct-note-body")).toContainText(
    "Contrato revisado",
  );
  const noteAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(noteAxe.violations).toEqual([]);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page
    .getByLabel("Observação", { exact: true })
    .fill(
      "Contrato revisado e evidência de UAT publicada no repositório do projeto.",
    );
  await page.getByRole("button", { name: "Salvar observação" }).click();
  await expect(page.locator(".ct-note-meta")).toContainText("v2");
  await page.getByRole("button", { name: "Fechar painel" }).click();
  await page.reload();
  await page.getByRole("button", { name: /Abrir observações/ }).click();
  await page
    .locator(".ct-notes-list button")
    .filter({ hasText: title })
    .click();
  await expect(page.locator(".ct-note-body")).toContainText(
    "evidência de UAT publicada",
  );
  await page.getByRole("button", { name: "Compartilhar ponto" }).click();
  await expect(
    page.getByRole("dialog", { name: "Compartilhar status" }),
  ).toBeVisible();
  await expect(page.getByLabel("Prévia do resumo")).toHaveValue(
    new RegExp(title),
  );
  await page.getByRole("checkbox", { name: title, exact: true }).uncheck();
  await expect(page.getByLabel("Prévia do resumo")).not.toHaveValue(
    new RegExp(title),
  );
  await page.getByRole("checkbox", { name: title, exact: true }).check();
  await page
    .getByRole("button", { name: "Copiar resumo", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Resumo copiado" }),
  ).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain(title);
  expect(clipboard).toContain("visão ao vivo");
  expect(clipboard).toContain("Aceite:");
  const file = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar resumo" }).click();
  expect((await file).suggestedFilename()).toBe("status-modernizacao.md");
  await page.screenshot({
    path: "docs/implementation/cockpit-share.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Fechar painel" }).click();
  await page.getByRole("button", { name: "Alternar tema" }).click();
  const light = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(light.violations).toEqual([]);
  await page.screenshot({
    path: "docs/implementation/cockpit-light.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/implementation/cockpit-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("observações de leitor são consultáveis, mas criação e edição são negadas", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("leitor@demo.local");
  await page.getByRole("button", { name: "Acessar plataforma" }).click();
  await page.getByRole("button", { name: /Abrir observações/ }).click();
  await expect(
    page.getByRole("button", { name: "Nova observação", exact: true }),
  ).toHaveCount(0);
  const pid = (await (await page.request.get("/api/v1/programs")).json())
    .items[0].id;
  const notes = await page.request.get(`/api/v1/observations?programId=${pid}`);
  expect(notes.status()).toBe(200);
  const rejected = await page.request.post(
    `/api/v1/observations?programId=${pid}`,
    {
      headers: { Origin: origin, "Idempotency-Key": crypto.randomUUID() },
      data: {
        subject_node_id: null,
        title: "Não permitido",
        body: "Leitor não escreve",
        important: false,
      },
    },
  );
  expect(rejected.status()).toBe(403);
  const items = (await notes.json()).items;
  if (items.length) {
    const edit = await page.request.patch(
      `/api/v1/observations/${items[0].id}?programId=${pid}`,
      {
        headers: { Origin: origin, "Idempotency-Key": crypto.randomUUID() },
        data: {
          title: items[0].title,
          body: "Tentativa do leitor",
          important: false,
          expectedVersion: Number(items[0].version),
        },
      },
    );
    expect(edit.status()).toBe(403);
  }
});
