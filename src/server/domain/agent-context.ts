import { z } from "zod";
import { AGENT_FIELDS } from "./agent-template";
const dimension = z
  .union([z.uuid(), z.literal("__unassigned__"), z.literal("")])
  .optional();
export const agentContextSchema = z
  .object({
    view: z
      .string()
      .max(40)
      .regex(/^[a-z]+$/),
    intent: z.enum(["EXPLAIN", "FILL", "PLAN"]).default("FILL"),
    filters: z
      .object({
        domain: dimension,
        stream: dimension,
        release: dimension,
        area: dimension,
        squad: dimension,
        owner: dimension,
        layer: z.string().max(40).optional(),
        search: z.string().max(200).optional(),
      })
      .strict()
      .default({}),
    subject: z
      .object({
        kind: z.enum(["observations", ...Object.keys(AGENT_FIELDS)]),
        id: z.uuid(),
      })
      .strict()
      .optional(),
    selection: z.array(z.uuid()).min(1).max(100).optional(),
  })
  .strict();
export type AgentContext = z.infer<typeof agentContextSchema>;
