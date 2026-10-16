import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const origin = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
async function login(page: Page, email: string) {
  await page.goto(`${origin}/login`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("Tower-Demo-2026!");
  await page.getByRole("button", { name: "Acessar plataforma" }).click();
  await expect(
    page.getByRole("heading", { name: "Visão executiva", exact: true }),
  ).toBeVisible();
}
test("mudança de escopo e baseline exigem revisão de outro usuário e persistem", async ({
  page,
  browser,
}) => {
  await login(page, "admin@demo.local");
  const pid = (await (await page.request.get("/api/v1/programs")).json())
    .items[0].id;
  const state = await (
    await page.request.get(`/api/v1/state?programId=${pid}`)
  ).json();
  const code = `E2E-GOV-${Date.now()}`,
    title = `Aprovação governada ${Date.now()}`;
  const created = await page.request.post(
    `/api/v1/capabilities?programId=${pid}`,
    {
      headers: { Origin: origin },
      data: {
        code,
        name: "Capacidade fictícia para revisão de escopo",
        domain_id: state.domains[0].id,
        acceptance_criteria: ["Comprovar alçada independente"],
      },
    },
  );
  expect(created.status()).toBe(201);
  const cap = await created.json();
  await page.getByRole("button", { name: "Atualizar dados" }).click();
  await page
    .getByRole("button", { name: "Change control", exact: true })
    .click();
  await page.getByRole("button", { name: "Nova solicitação" }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Alvo de escopo")
    .selectOption({ label: `${code} · ${cap.name}` });
  await dialog.getByLabel("Título da solicitação").fill(title);
  await dialog
    .getByLabel("Motivo da mudança")
    .fill("Aprovar escopo inicial com rastreabilidade");
  await dialog
    .getByLabel("Alternativas consideradas")
    .fill("Manter proposta ou aprovar por onda");
  await dialog
    .getByLabel("Riscos e mitigação")
    .fill("Validar todas as evidências antes de produção");
  await dialog.getByRole("button", { name: "Analisar impacto" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Antes de enviar" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Enviar para revisão" }).click();
  await expect(
    page.getByText("Solicitação enviada para revisão."),
  ).toBeVisible();
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(
    page.getByRole("button", { name: "Aprovar mudança" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Aplicar mudança" }),
  ).toHaveCount(0);
  const context = await browser.newContext({
      baseURL: origin,
      viewport: { width: 1440, height: 1100 },
    }),
    reviewer = await context.newPage();
  try {
    await login(reviewer, "pmo@demo.local");
    await reviewer
      .getByRole("button", { name: "Change control", exact: true })
      .click();
    await reviewer.getByRole("button", { name: new RegExp(title) }).click();
    await reviewer
      .getByLabel("Justificativa da decisão ou cancelamento")
      .fill("Impacto analisado e escopo autorizado pelo PMO");
    await reviewer.getByRole("button", { name: "Aprovar mudança" }).click();
    await expect(reviewer.getByRole("dialog")).toContainText(
      "Decisão de Bruno Reis",
    );
    await page.getByRole("button", { name: "Fechar painel" }).click();
    await page.getByRole("button", { name: "Atualizar dados" }).click();
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await page.getByRole("button", { name: "Aplicar mudança" }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "Aplicada por Alex Morgan",
    );
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({
      path: "docs/implementation/change-control-desktop.png",
      fullPage: false,
    });
    await page.getByRole("button", { name: "Fechar painel" }).click();
    await page.reload();
    const persisted = await (
      await page.request.get(`/api/v1/capabilities/${cap.id}?programId=${pid}`)
    ).json();
    expect(persisted.scope_status).toBe("APPROVED");
    const forbidden = await page.request.patch(
      `/api/v1/capabilities/${cap.id}?programId=${pid}`,
      {
        headers: { Origin: origin, "If-Match": `"${persisted.version}"` },
        data: {
          name: "Contornar escopo aprovado",
          changeReason: "Teste de guarda de escopo",
        },
      },
    );
    expect(forbidden.status()).toBe(409);
    await page
      .getByRole("button", { name: "Delivery & roadmap", exact: true })
      .click();
    await page.getByRole("button", { name: "Propor nova baseline" }).click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Motivo do compromisso")
      .fill("Congelar compromisso fictício para revisão independente");
    await dialog
      .getByRole("button", { name: "Enviar baseline para revisão" })
      .click();
    await expect(
      page.getByText("Baseline atualizada e auditada."),
    ).toBeVisible();
    const latest = (
      await (await page.request.get(`/api/v1/state?programId=${pid}`)).json()
    ).baselines[0];
    expect(latest.status).toBe("SUBMITTED");
    await page
      .getByRole("button", {
        name: `Revisar compromisso v${latest.version}`,
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Outra pessoa com alçada",
    );
    await expect(
      page.getByRole("button", { name: "Aprovar baseline" }),
    ).toHaveCount(0);
    await reviewer.getByRole("button", { name: "Fechar painel" }).click();
    await reviewer.getByRole("button", { name: "Atualizar dados" }).click();
    await reviewer
      .getByRole("button", { name: "Delivery & roadmap", exact: true })
      .click();
    await reviewer
      .getByRole("button", {
        name: `Revisar compromisso v${latest.version}`,
        exact: true,
      })
      .click();
    await reviewer
      .getByLabel("Justificativa da revisão")
      .fill("Inventário e compromisso conferidos pelo PMO");
    await reviewer.getByRole("button", { name: "Aprovar baseline" }).click();
    await expect(reviewer.getByRole("dialog")).toContainText(
      "Decisão de Bruno Reis",
    );
    expect(
      (
        await (
          await reviewer.request.get(`/api/v1/state?programId=${pid}`)
        ).json()
      ).baselines[0].status,
    ).toBe("APPROVED");
    await reviewer.locator(".dialog-body").evaluate((el) => {
      el.scrollTop = 0;
    });
    await reviewer.screenshot({
      path: "docs/implementation/baseline-review-desktop.png",
      fullPage: false,
    });
    // Report reuses the two authenticated identities: the author cannot review their own text.
    await page.getByRole("button", { name: "Fechar painel" }).click();
    await reviewer.getByRole("button", { name: "Fechar painel" }).click();
    await page.getByRole("button", { name: "Relatórios", exact: true }).click();
    for (let i = 0; i < 2; i++) {
      const snapResponse = page.waitForResponse(
        (r) =>
          r.url().includes("/snapshots?") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Criar snapshot" }).click();
      expect((await snapResponse).ok()).toBe(true);
      await expect(
        page.getByRole("button", { name: "Preparar report" }),
      ).toBeEnabled();
    }
    await page
      .getByRole("button", { name: "Comparar snapshots", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Comparar snapshots", exact: true }),
    ).toContainText("Delta de aceites");
    await page.getByRole("button", { name: "Fechar painel" }).click();
    await page.getByRole("button", { name: "Preparar report" }).click();
    const reportTitle = `Report governado ${Date.now()}`;
    await page.getByLabel("Título do report").fill(reportTitle);
    await page
      .getByLabel("Análise e recomendações")
      .fill(
        "Confirmar evidências antes da liberação de produção. Números conferidos contra o snapshot.",
      );
    await page
      .getByRole("button", { name: "Enviar para revisão", exact: true })
      .click();
    await page.getByRole("button", { name: new RegExp(reportTitle) }).click();
    await expect(
      page.getByRole("button", { name: "Aprovar report" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Fechar painel" }).click();
    await reviewer.getByRole("button", { name: "Atualizar dados" }).click();
    await reviewer
      .getByRole("button", { name: "Relatórios", exact: true })
      .click();
    await reviewer
      .getByRole("button", { name: new RegExp(reportTitle) })
      .click();
    await reviewer
      .getByLabel("Justificativa da decisão do report")
      .fill("Conteúdo e indicadores revisados pelo PMO.");
    await reviewer.getByRole("button", { name: "Aprovar report" }).click();
    await expect(
      reviewer.getByRole("button", { name: "Publicar no programa" }),
    ).toBeVisible();
    await reviewer
      .getByLabel("Justificativa da decisão do report")
      .fill("Report revisado para acompanhamento interno.");
    await reviewer
      .getByRole("button", { name: "Publicar no programa" })
      .click();
    await expect(reviewer.locator(".report-document")).toContainText(
      "PUBLICADO",
    );
    await expect(
      reviewer.getByRole("button", { name: "Publicar no programa" }),
    ).toHaveCount(0);
    const reportAxe = await new AxeBuilder({ page: reviewer })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(reportAxe.violations).toEqual([]);
    await reviewer.screenshot({
      path: "docs/implementation/report-published.png",
    });
    await reviewer.emulateMedia({ media: "print" });
    await expect(reviewer.locator(".topbar")).toBeHidden();
    await expect(reviewer.locator(".report-document")).toBeVisible();
    await reviewer.screenshot({
      path: "docs/implementation/report-print.png",
      fullPage: true,
    });
    await reviewer.emulateMedia({ media: "screen" });
    const reportFile = reviewer.waitForEvent("download");
    await reviewer
      .getByRole("button", { name: "Exportar report", exact: true })
      .click();
    expect((await reportFile).suggestedFilename()).toMatch(/^report-.*\.json$/);
    await reviewer.getByRole("button", { name: "Fechar painel" }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  } finally {
    await context.close();
  }
});
