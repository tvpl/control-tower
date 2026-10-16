import { z } from "zod";
export const catalogCode = z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/),
  name = z.string().trim().min(3).max(200);
export const applicabilityRule = z
  .object({
    layers: z.array(catalogCode).max(100).default([]),
    types: z
      .array(
        z.enum([
          "API",
          "UI",
          "CONTRACT",
          "INFRA",
          "EVENT",
          "TEST",
          "DOCUMENTATION",
          "OPERATION",
        ]),
      )
      .default([]),
    criticalities: z
      .array(z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]))
      .default([]),
    workstream_ids: z.array(z.uuid()).default([]),
  })
  .strict();
export const catalogSchemas = {
  layers: z.object({
    code: catalogCode,
    name,
    active: z.boolean().default(true),
  }),
  gates: z.object({
    code: catalogCode,
    name,
    category: z.enum([
      "PRODUCT",
      "ARCHITECTURE",
      "ENGINEERING",
      "PERFORMANCE",
      "SECURITY",
      "RESILIENCE",
      "DATA",
      "OBSERVABILITY",
      "INFRASTRUCTURE",
      "OPERATIONS",
      "INTEGRATIONS",
    ]),
    blocking: z.boolean(),
    criteria: z.string().trim().min(3).max(5000),
    applicability_rule: applicabilityRule.default({
      layers: [],
      types: [],
      criticalities: [],
      workstream_ids: [],
    }),
  }),
  profiles: z.object({
    code: catalogCode,
    name,
    rule: applicabilityRule,
    gate_ids: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, "Gates duplicados"),
    active: z.boolean().default(true),
  }),
};
