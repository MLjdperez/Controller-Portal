// Audit writer usable from both the app and CLI scripts (no 'server-only' import here).
import type { AuditAction, Prisma } from '@prisma/client';

export type AuditEntry = {
  userId?: string | null;
  action: AuditAction;
  objectType: string;
  objectId?: string | null;
  entityId?: string | null;
  summary: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ipAddress?: string | null;
};

type AuditClient = { auditLog: { create(args: { data: AuditEntry }): Promise<unknown> } };

/** Append one audit row. Pass the transaction client so the record and its audit commit together. */
export function audit(client: AuditClient, entry: AuditEntry) {
  return client.auditLog.create({ data: entry });
}
