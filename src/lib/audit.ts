import { PrismaClient } from "@prisma/client";

type AuditParams = {
  actorId?: string;
  entityType: string;
  entityId: string;
  action: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export async function withAudit(
  prisma: PrismaClient | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  params: AuditParams
): Promise<void> {
  await (prisma as PrismaClient).auditLog.create({
    data: {
      actorId: params.actorId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      changes: params.changes as Record<string, never> | undefined,
      metadata: params.metadata as Record<string, never> | undefined,
    },
  });
}
