import { z } from "zod";
import { schemas } from "./schemas";

export const bulkValuesSchema = z
  .object({
    owner_id: schemas.deliverables.shape.owner_id,
    workstream_id: z.uuid().optional(),
    area_id: schemas.deliverables.shape.area_id,
    squad_id: schemas.deliverables.shape.squad_id,
    forecast_date: schemas.deliverables.shape.forecast_date,
    planning_status: schemas.deliverables.shape.planning_status
      .removeDefault()
      .optional(),
    execution_status: schemas.deliverables.shape.execution_status
      .removeDefault()
      .optional(),
    criticality: schemas.deliverables.shape.criticality
      .removeDefault()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Selecione ao menos um campo.");
export const bulkEditSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            expectedVersion: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    change: z.discriminatedUnion("action", [
      z.object({ action: z.literal("SET"), values: bulkValuesSchema }).strict(),
      z
        .object({
          action: z.literal("SHIFT_FORECAST"),
          days: z
            .number()
            .int()
            .min(-3650)
            .max(3650)
            .refine(
              (v) => v !== 0,
              "Informe um deslocamento diferente de zero.",
            ),
        })
        .strict(),
    ]),
    reason: z.string().trim().min(3).max(2000),
  })
  .strict();
export const externalLinkSchema = z
  .object({
    externalId: z.string().trim().min(1).max(200),
    subjectNodeId: z.uuid(),
    mode: z.enum(["REFERENCE", "EXECUTION"]),
    reason: z.string().trim().min(3).max(2000),
  })
  .strict();
export const gitLabLinksSchema = z
  .object({
    expectedConnectionVersion: z.number().int().positive(),
    items: z
      .array(
        externalLinkSchema
          .omit({ reason: true })
          .extend({
            expectedReferenceVersion: z.number().int().positive().nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    reason: z.string().trim().min(3).max(2000),
  })
  .strict();
export type BulkEdit = z.infer<typeof bulkEditSchema>;
export type GitLabLinks = z.infer<typeof gitLabLinksSchema>;
export type ExternalLink = z.infer<typeof externalLinkSchema>;
