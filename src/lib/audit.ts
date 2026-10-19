import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { audit as write, type AuditEntry } from './audit-core';

export type { AuditEntry };

/** Append one audit row. Pass `tx` inside a transaction so the record and its audit commit together. */
export function audit(entry: AuditEntry, tx: Prisma.TransactionClient = db) {
  return write(tx, entry);
}
