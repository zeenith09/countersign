import type { PrismaClient } from "../../generated/prisma/client";
import { appendAuditEntry } from "../audit/chain";
import { getPrisma } from "../prisma";
import { toolRegistry } from "../tools";
import { validToolParameters } from "../tools/parameters";

type MockedToolResult = ReturnType<(typeof toolRegistry)[keyof typeof toolRegistry]>;

export type MockedToolExecution =
  | { kind: "executed"; result: MockedToolResult }
  | { kind: "invalid_parameters" };

function isRegisteredTool(tool: string): tool is keyof typeof toolRegistry {
  return Object.prototype.hasOwnProperty.call(toolRegistry, tool);
}

export async function executeMockedTool(
  actionId: string,
  tool: string,
  parameters: unknown,
  getDatabase: () => PrismaClient = getPrisma,
): Promise<MockedToolExecution> {
  if (!isRegisteredTool(tool)) {
    throw new Error("Approved action has an unsupported tool.");
  }
  if (!validToolParameters(tool, parameters)) {
    await getDatabase().$transaction(async (transaction) => {
      await appendAuditEntry(transaction, "tool_execution_rejected", {
        action_id: actionId,
        tool,
        reason: "invalid_parameters",
      });
    }, { maxWait: 15_000, timeout: 30_000 });
    return { kind: "invalid_parameters" };
  }

  return {
    kind: "executed",
    result: toolRegistry[tool](actionId, parameters),
  };
}
