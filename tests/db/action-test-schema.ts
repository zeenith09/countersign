import { PrismaClient } from "../../src/generated/prisma/client";

export async function createActionTestTables(admin: PrismaClient, schema: string): Promise<void> {
  await admin.$executeRawUnsafe(`CREATE TYPE "${schema}".action_status AS ENUM ('pending', 'approved', 'denied', 'auto_allowed', 'blocked')`);
  await admin.$executeRawUnsafe(`CREATE TYPE "${schema}".decision_outcome AS ENUM ('approved', 'denied')`);
  await admin.$executeRawUnsafe(`
    CREATE TABLE "${schema}".actions (
      id UUID PRIMARY KEY, agent_id TEXT NOT NULL, tool TEXT NOT NULL,
      parameters JSONB NOT NULL, agent_reasoning TEXT NOT NULL,
      status "${schema}".action_status NOT NULL DEFAULT 'pending',
      policy_rule_matched TEXT, created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  await admin.$executeRawUnsafe(`
    CREATE TABLE "${schema}".decisions (
      id UUID PRIMARY KEY, action_id UUID NOT NULL UNIQUE REFERENCES "${schema}".actions(id),
      reviewer TEXT NOT NULL, outcome "${schema}".decision_outcome NOT NULL,
      reason TEXT NOT NULL, edited_parameters JSONB,
      decided_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  await admin.$executeRawUnsafe(`
    CREATE TABLE "${schema}".audit_log (
      id UUID PRIMARY KEY, sequence BIGINT NOT NULL UNIQUE, event_type TEXT NOT NULL,
      payload JSONB NOT NULL, prev_hash CHAR(64), hash CHAR(64) NOT NULL,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
}
