import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
export async function verifyVisualManagement(page: Page) {
  const map = page.getByRole("region", {
    name: "Gestão visual do projeto",
    exact: true,
  });
  await expect(
    page.getByRole("heading", { name: "Mapa vivo do projeto", exact: true }),
  ).toBeVisible();
  const pid = await page.getByLabel("Programa atual").inputValue();
  let s = await (
    await page.request.get(`/api/v1/state?programId=${pid}`)
  ).json();
  const linkedFeature = s.capabilities.find((c: any) =>
    s.links.some((l: any) => l.capability_id === c.id),
  );
  const late = await page.request.post(
    `/api/v1/deliverables?programId=${pid}`,
    {
      headers: {
        Origin: new URL(page.url()).origin,
        "Idempotency-Key": crypto.randomUUID(),
      },
      data: {
        code: `VIS-LATE-${Date.now()}`,
        name: "Entrega com prazo vencido para QA visual",
        workstream_id: s.workstreams[0].id,
        capability_ids: [linkedFeature.id],
        layer: "BACKEND",
        deliverable_type: "API",
        forecast_date: "2020-01-01",
        owner_id: s.users[0].id,
        acceptance_criteria:
          "Comprovar o alerta visual com prazo vencido no QA",
      },
    },
  );
  expect(late.ok()).toBe(true);
  await page.reload();
  s = await (await page.request.get(`/api/v1/state?programId=${pid}`)).json();
  await expect(map.locator(".mg-feature")).toHaveCount(
    Math.min(20, s.capabilities.length),
  );
  await expect(
    map.getByRole("button", { name: "Panorama", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await map.locator(".mg-domain-group").count()).toBeGreaterThan(1);
  await expect(map.locator(".mg-canvas")).toHaveCount(0);
  await map
    .getByRole("button", { name: "Recolher grupos", exact: true })
    .click();
  await expect(map.locator(".mg-feature")).toHaveCount(0);
  await map
    .locator(".mg-domain-group")
    .first()
    .getByRole("button")
    .first()
    .click();
  const foldedNeighbor = await map
    .locator(".mg-domain-group")
    .nth(1)
    .boundingBox();
  expect(foldedNeighbor!.height).toBeLessThan(170);
  await map
    .getByRole("button", { name: "Expandir grupos", exact: true })
    .click();
  await expect(map.locator(".mg-feature")).toHaveCount(
    Math.min(20, s.capabilities.length),
  );

  await expect(map.locator(".mg-signal.mg-active strong")).toHaveText(
    String(
      s.deliverables.filter((d: any) => d.execution_status === "IN_PROGRESS")
        .length,
    ),
  );
  await map
    .getByRole("button", { name: /Prazo vencido.*Filtrar features/ })
    .click();
  await expect(map.locator(".mg-signal.mg-overdue strong")).not.toHaveText("0");
  await expect(map.locator(".mg-feature").first()).toBeVisible();
  await expect(map.locator(".mg-signal.mg-overdue")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await map.getByRole("button", { name: "Limpar mapa", exact: true }).click();
  const feature = s.capabilities.find((c: any) =>
    s.links.some((l: any) => l.capability_id === c.id),
  );
  await map.getByLabel("Buscar feature no mapa").fill(feature.code);
  await expect(map.locator(".mg-feature")).toHaveCount(1);
  await map.locator(".mg-feature").click();
  const detail = page.getByRole("dialog", {
    name: `Panorama da feature · ${feature.code}`,
    exact: true,
  });
  await expect(detail).toBeVisible();
  await expect(detail.locator(".mg-deliverable").first()).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([]);
  await detail.locator(".mg-deliverable").first().click();
  await expect(page.locator(".dialog.drawer")).toBeVisible();
  await page
    .getByRole("button", { name: "Fechar painel", exact: true })
    .click();
  await map.getByRole("button", { name: "Limpar mapa", exact: true }).click();
  await map
    .getByRole("button", {
      name: `Explorar feature ${feature.code} ${feature.name}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Focar nesta feature", exact: true })
    .click();
  await expect(page.locator(".mg-focus-banner")).toContainText(feature.code);
  await page
    .getByRole("button", { name: "Voltar ao mapa completo", exact: true })
    .click();
  if (
    await map
      .getByRole("button", { name: "Inspecionar vínculos", exact: true })
      .count()
  ) {
    await map
      .getByRole("button", { name: "Inspecionar vínculos", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", {
        name: "Vínculos entre features",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Fechar painel", exact: true })
      .click();
  }
  await map.getByLabel("Organizar mapa por").selectOption("STATE");
  await map
    .getByLabel("Filtrar grupo do mapa")
    .selectOption({ label: "Em andamento" });
  await expect(map.locator(".mg-feature").first()).toBeVisible();
  await map.getByRole("button", { name: "Limpar mapa", exact: true }).click();
  await map.getByLabel("Organizar mapa por").selectOption("DOMAIN");
  await map.getByRole("button", { name: "Relações", exact: true }).click();
  const groupCount = await map.locator(".mg-domain-node").count();
  expect(groupCount).toBeGreaterThan(1);
  await map.locator(".mg-domain-node").first().click();
  await expect(map.locator(".mg-feature").first()).toBeVisible();
  await map
    .getByRole("button", { name: "Voltar aos grupos", exact: true })
    .click();
  await expect(map.locator(".mg-domain-node")).toHaveCount(groupCount);
  await page
    .getByRole("button", { name: "Ampliar mapa do projeto", exact: true })
    .click();
  const expanded = page.getByRole("dialog", {
    name: "Mapa ampliado do projeto",
    exact: true,
  });
  await expect(expanded.locator(".mg-domain-node")).toHaveCount(groupCount);
  await expect(expanded.locator(".react-flow__minimap-node")).toHaveCount(
    groupCount,
  );
  expect(
    await expanded.locator(".mg-canvas").evaluate((el) => {
      const nodes = [...el.querySelectorAll(".react-flow__node-domain")].map(
        (n) => n.getBoundingClientRect(),
      );
      return [...el.querySelectorAll(".react-flow__edge-textbg")].every((e) => {
        const r = e.getBoundingClientRect();
        return nodes.every(
          (n) =>
            r.right <= n.left + 1 ||
            r.left >= n.right - 1 ||
            r.bottom <= n.top + 1 ||
            r.top >= n.bottom - 1,
        );
      });
    }),
  ).toBe(true);
  await expanded.screenshot({
    path: "docs/implementation/clarity-relations.png",
  });
  await page.screenshot({
    path: "docs/implementation/management-map-expanded.png",
    fullPage: false,
  });
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([]);
  await expanded
    .getByRole("button", { name: "Fechar painel", exact: true })
    .click();
  await map.getByRole("button", { name: "Panorama", exact: true }).click();
  await expect(map.locator(".mg-domain-grid")).toBeVisible();
  await map.screenshot({
    path: "docs/implementation/clarity-panorama-orange.png",
  });
  await map.screenshot({
    path: "docs/implementation/management-map-orange.png",
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/implementation/management-home-firstfold.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await map.getByRole("button", { name: "Panorama", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include(".mg-landscape").analyze())
      .violations,
  ).toEqual([]);
  await map.screenshot({
    path: "docs/implementation/clarity-panorama-mobile.png",
  });
  await map.screenshot({
    path: "docs/implementation/management-map-mobile.png",
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await map.getByRole("button", { name: "Relações", exact: true }).click();
  await page
    .getByRole("button", { name: "Explorar portfólio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Projetos em movimento", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/implementation/management-portfolio.png",
    fullPage: true,
  });
  await page.locator('aside [data-destination="delivery"]').click();
  await expect(
    page.getByRole("region", { name: "Horizonte de entregas", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/implementation/management-delivery.png",
    fullPage: true,
  });
  await page.locator('aside [data-destination="capabilities"]').click();
  await page
    .getByRole("button", { name: "Mapa visual de features", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mapa vivo do projeto", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Matriz de capacidades/ }).click();
  await expect(page.locator(".capability-matrix")).toBeVisible();
  await page.locator('aside [data-destination="overview"]').click();
  await expect(
    page.getByRole("heading", { name: "Mapa vivo do projeto", exact: true }),
  ).toBeVisible();
}
