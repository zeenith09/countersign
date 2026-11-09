import type { Prisma, PrismaClient } from "../../generated/prisma/client";

export async function storeAction(
  client: PrismaClient | Prisma.TransactionClient,
  data: Prisma.ActionCreateInput,
): Promise<{ id: string }> {
  return client.action.create({ data, select: { id: true } });
}
