import 'server-only';
import type { AuditAction, Prisma } from '@prisma/client';
import { db } from './db';

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

/** Append one audit row. Pass `tx` inside a transaction so the record and its audit commit together. */
export function audit(entry: AuditEntry, tx: Prisma.TransactionClient = db) {
  return tx.auditLog.create({ data: entry });
}
