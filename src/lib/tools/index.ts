export function sendEmail(actionId: string, _parameters?: unknown): { mocked: true; tool: "send_email" } {
  console.log("send_email", actionId, _parameters === undefined ? "without parameters" : "with parameters");
  return { mocked: true, tool: "send_email" };
}

export function issueRefund(actionId: string, _parameters?: unknown): { mocked: true; tool: "issue_refund" } {
  console.log("issue_refund", actionId, _parameters === undefined ? "without parameters" : "with parameters");
  return { mocked: true, tool: "issue_refund" };
}

export function deleteRecord(actionId: string, _parameters?: unknown): { mocked: true; tool: "delete_record" } {
  console.log("delete_record", actionId, _parameters === undefined ? "without parameters" : "with parameters");
  return { mocked: true, tool: "delete_record" };
}

export const toolRegistry = {
  send_email: sendEmail,
  issue_refund: issueRefund,
  delete_record: deleteRecord,
} as const;
