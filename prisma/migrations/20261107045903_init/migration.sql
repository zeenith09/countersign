-- CreateEnum
CREATE TYPE "action_status" AS ENUM ('pending', 'approved', 'denied', 'auto_allowed', 'blocked');

-- CreateEnum
CREATE TYPE "decision_outcome" AS ENUM ('approved', 'denied');

-- CreateTable
CREATE TABLE "actions" (
    "id" UUID NOT NULL,
    "agent_id" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "agent_reasoning" TEXT NOT NULL,
    "status" "action_status" NOT NULL DEFAULT 'pending',
    "policy_rule_matched" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decisions" (
    "id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "reviewer" TEXT NOT NULL,
    "outcome" "decision_outcome" NOT NULL,
    "reason" TEXT NOT NULL,
    "edited_parameters" JSONB,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "sequence" BIGINT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "prev_hash" CHAR(64),
    "hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "actions_status_created_at_idx" ON "actions"("status", "created_at");

-- CreateIndex
CREATE INDEX "actions_agent_id_created_at_idx" ON "actions"("agent_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "decisions_action_id_key" ON "decisions"("action_id");

-- CreateIndex
CREATE INDEX "decisions_reviewer_decided_at_idx" ON "decisions"("reviewer", "decided_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_sequence_key" ON "audit_log"("sequence");

-- CreateIndex
CREATE INDEX "audit_log_event_type_created_at_idx" ON "audit_log"("event_type", "created_at");

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
