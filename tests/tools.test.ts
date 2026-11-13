import { afterEach, describe, expect, it, vi } from "vitest";
import { toolRegistry } from "../src/lib/tools";

describe("mocked tools", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["send_email", "send_email"],
    ["issue_refund", "issue_refund"],
    ["delete_record", "delete_record"],
  ] as const)("logs %s without parameters", (toolName, logName) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = toolRegistry[toolName]("action-123");

    expect(result).toEqual({ mocked: true, tool: toolName });
    expect(log).toHaveBeenCalledExactlyOnceWith(logName, "action-123", "without parameters");
  });

  it.each([
    ["send_email", "send_email"],
    ["issue_refund", "issue_refund"],
    ["delete_record", "delete_record"],
  ] as const)("logs %s with parameters", (toolName, logName) => {
    const parameters = { example: "value" };
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = toolRegistry[toolName]("action-123", parameters);

    expect(result).toEqual({ mocked: true, tool: toolName });
    expect(log).toHaveBeenCalledExactlyOnceWith(logName, "action-123", "with parameters");
  });
});
