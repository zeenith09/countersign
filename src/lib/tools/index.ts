export function sendEmail(actionId: string): { mocked: true; tool: "send_email" } {
  console.log("send_email", actionId);
  return { mocked: true, tool: "send_email" };
}

export function issueRefund(actionId: string): { mocked: true; tool: "issue_refund" } {
  console.log("issue_refund", actionId);
  return { mocked: true, tool: "issue_refund" };
}

export function deleteRecord(actionId: string): { mocked: true; tool: "delete_record" } {
  console.log("delete_record", actionId);
  return { mocked: true, tool: "delete_record" };
}

export const toolRegistry = {
  send_email: sendEmail,
  issue_refund: issueRefund,
  delete_record: deleteRecord,
} as const;
