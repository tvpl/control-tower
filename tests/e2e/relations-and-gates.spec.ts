import { test, expect } from "@playwright/test";
const origin = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
test("relação técnica tipada persiste e exceção de gate pode ser revogada pela alçada", async ({
  page,
  browser,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Acessar plataforma" }).click();
  await expect(
    page.getByRole("heading", { name: "Visão executiva", exact: true }),
  ).toBeVisible();
  const pid = (await (await page.request.get("/api/v1/programs")).json())
    .items[0].id;
  const s = await (
    await page.request.get(`/api/v1/state?programId=${pid}`)
  ).json();
  const cap = s.capabilities.find((c: any) => c.code === "AUT-001"),
    d = s.deliverables[0],
    node = s.nodes.find(
      (n: any) => n.entity_id === d.id && n.entity_type === "deliverables",
    );
  await page.getByRole("button", { name: "Arquitetura", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo registro", exact: true })
    .click();
  const dialog = page.getByRole("dialog"),
    code = `E2E-COMP-${Date.now()}`;
  await dialog.getByLabel("Código").fill(code);
  await dialog
    .getByLabel("Nome", { exact: false })
    .fill("Componente fictício para relação tipada");
  await dialog
    .getByLabel("Capacidades atendidas")
    .selectOption({ label: cap.name });
  await dialog
    .getByLabel(`${cap.code} · ${cap.name}`)
    .selectOption("IMPLEMENTS");
  await dialog.getByRole("button", { name: "Salvar registro" }).click();
  await expect(
    page.getByText("Registro salvo e alteração auditada."),
  ).toBeVisible();
  await page.reload();
  const now = await (
    await page.request.get(`/api/v1/state?programId=${pid}`)
  ).json();
  const component = now.components.find((c: any) => c.code === code);
  expect(component).toBeTruthy();
  expect(
    now.componentLinks.find((l: any) => l.component_id === component.id)
      .relation_type,
  ).toBe("IMPLEMENTS");
  const evidence = await page.request.post(
    `/api/v1/evidence?programId=${pid}`,
    {
      headers: { Origin: origin },
      data: {
        subject_node_id: node.id,
        title: "Evidência fictícia para teste de exceção",
        url: "https://evidence.example.test/e2e-exception",
        source: "Teste automatizado fictício",
        artifact_version: "1.0",
        classification: "INTERNAL",
      },
    },
  );
  expect(evidence.status()).toBe(201);
  const ev = await evidence.json();
  const sit = s.gates.find((g: any) => g.code === "SIT");
  const context = await browser.newContext({
      baseURL: origin,
      viewport: { width: 1440, height: 1100 },
    }),
    approver = await context.newPage();
  try {
    await approver.goto("/login");
    await approver.getByLabel("E-mail").fill("aprovador@demo.local");
    await approver.getByLabel("Senha").fill("Tower-Demo-2026!");
    await approver.getByRole("button", { name: "Acessar plataforma" }).click();
    await expect(
      approver.getByRole("heading", { name: "Visão executiva", exact: true }),
    ).toBeVisible();
    await approver
      .getByRole("button", { name: "Readiness & gates", exact: true })
      .click();
    await approver
      .getByRole("button", {
        name: `Avaliar ${sit.name} de ${d.code}`,
        exact: true,
      })
      .click();
    let gateDialog = approver.getByRole("dialog");
    await gateDialog.getByLabel("Resultado").selectOption("EXCEPTION_APPROVED");
    await gateDialog.getByLabel("Evidências da entidade").selectOption(ev.id);
    await gateDialog
      .getByLabel("Justificativa")
      .fill("Exceção fictícia com risco explícito para testar revogação");
    await gateDialog
      .getByLabel("Validade")
      .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    await gateDialog
      .getByLabel("Risco aceito")
      .fill("Mitigar por monitoramento e revalidação antes do rollout");
    await gateDialog
      .getByLabel("Plano de mitigação da exceção")
      .fill("Monitorar e revalidar diariamente antes do rollout");
    await gateDialog
      .getByLabel("Referência da decisão de exceção")
      .fill("ADR-QA-EXCEPTION-001");
    await gateDialog
      .getByRole("button", { name: "Registrar avaliação" })
      .click();
    await expect(approver.getByText("Avaliação registrada.")).toBeVisible();
    await approver
      .getByRole("button", {
        name: `Avaliar ${sit.name} de ${d.code}`,
        exact: true,
      })
      .click();
    gateDialog = approver.getByRole("dialog");
    await gateDialog
      .getByLabel("Justificativa")
      .fill("Revogar pois a mitigação fictícia não foi comprovada");
    await gateDialog.getByRole("button", { name: "Revogar exceção" }).click();
    await expect(gateDialog).not.toBeVisible();
    await expect(approver.getByText("Avaliação registrada.")).toBeVisible();
    const after = await (
      await approver.request.get(`/api/v1/state?programId=${pid}`)
    ).json();
    const gate = after.gates.find((g: any) => g.code === "SIT");
    expect(
      after.assessments.find(
        (a: any) => a.subject_node_id === node.id && a.gate_id === gate.id,
      ).result,
    ).toBe("PENDING");
    expect(after.audit.some((a: any) => a.action === "ExceptionRevoked")).toBe(
      true,
    );
  } finally {
    await context.close();
  }
});
