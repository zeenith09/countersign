export function sendEmail(actionId: string, parameters?: unknown): { mocked: true; tool: "send_email" } {
  if (parameters === undefined) console.log("send_email", actionId);
  else console.log("send_email", actionId, parameters);
  return { mocked: true, tool: "send_email" };
}

export function issueRefund(actionId: string, parameters?: unknown): { mocked: true; tool: "issue_refund" } {
  if (parameters === undefined) console.log("issue_refund", actionId);
  else console.log("issue_refund", actionId, parameters);
  return { mocked: true, tool: "issue_refund" };
}

export function deleteRecord(actionId: string, parameters?: unknown): { mocked: true; tool: "delete_record" } {
  if (parameters === undefined) console.log("delete_record", actionId);
  else console.log("delete_record", actionId, parameters);
  return { mocked: true, tool: "delete_record" };
}

export const toolRegistry = {
  send_email: sendEmail,
  issue_refund: issueRefund,
  delete_record: deleteRecord,
} as const;
