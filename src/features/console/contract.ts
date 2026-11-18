import { z } from "zod";

export const consoleStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "auto_allowed",
  "blocked",
]);

export const actionStatusSchema = consoleStatusSchema;

export const consoleSnapshotSchema = z.object({
  actions: z.array(z.object({
    id: z.string(),
    tool: z.string(),
    title: z.string(),
    summary: z.string(),
    reasoning: z.string(),
    age: z.string(),
    created: z.number(),
    status: z.literal("pending"),
    risk: z.string(),
    rule: z.string(),
    ruleDescription: z.string(),
    parameters: z.unknown(),
  })),
  counts: z.partialRecord(consoleStatusSchema, z.number().int().nonnegative()),
  activity: z.array(z.object({
    id: z.string(),
    title: z.string(),
    detail: z.string(),
    status: consoleStatusSchema,
    actor: z.string(),
    rule: z.string().optional(),
    time: z.string(),
  })),
  audit: z.array(z.object({
    id: z.string(),
    sequence: z.string(),
    event: z.string(),
    hash: z.string(),
    createdAt: z.string(),
    principal: z.string(),
  })),
});

export type ConsoleStatus = z.infer<typeof consoleStatusSchema>;
export type ConsoleSnapshot = z.infer<typeof consoleSnapshotSchema>;
export type ConsoleAction = ConsoleSnapshot["actions"][number];
export type ConsoleActivityItem = ConsoleSnapshot["activity"][number];
export type ConsoleAuditEntry = ConsoleSnapshot["audit"][number];

export type ActionDecision = {
  reviewer: string;
  outcome: "approved" | "denied";
  reason: string;
};
