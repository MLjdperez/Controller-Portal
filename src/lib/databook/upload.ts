// Databook import from the browser (Controller only): upload → check → import → verify against the database.
// Same parser, loader and checks as the CLI scripts; the original file is kept by SHA-256 like every upload.

import ExcelJS from 'exceljs';
import type { Permission, PrismaClient } from '@prisma/client';
import { audit } from '../audit-core';
import { readStored, storeUpload } from '../storage';
import { checkDatabook, latestPeriodWithData } from './check';
import { loadDatabook, type LoadSummary } from './load';

export const MAX_DATABOOK_BYTES = 10 * 1024 * 1024;
export type Importer = { id: string; permissions: Set<Permission> };

export async function workbookFromStorage(storageKey: string) {
  const bytes = await readStored(storageKey);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return wb;
}

export type ReceiveDatabook = { ok: true; batchId: string } | { ok: false; error: 'FORBIDDEN' | 'BAD_FILE_TYPE' | 'TOO_LARGE' | 'EMPTY' | 'UNREADABLE' };

export async function receiveDatabook(db: PrismaClient, user: Importer, args: { fileName: string; bytes: Uint8Array }): Promise<ReceiveDatabook> {
  if (!user.permissions.has('ADMIN_COA')) return { ok: false, error: 'FORBIDDEN' };
  if (!/\.xlsx$/i.test(args.fileName)) return { ok: false, error: 'BAD_FILE_TYPE' };
  if (!args.bytes.byteLength) return { ok: false, error: 'EMPTY' };
  if (args.bytes.byteLength > MAX_DATABOOK_BYTES) return { ok: false, error: 'TOO_LARGE' };

  const { sha256, storageKey } = await storeUpload(args.fileName, args.bytes);
  let wb: ExcelJS.Workbook;
  try { wb = await workbookFromStorage(storageKey); } catch { return { ok: false, error: 'UNREADABLE' }; }
  const through = latestPeriodWithData(wb);
  const check = through ? checkDatabook(wb, through) : null;
  const committed = await db.importBatch.findFirst({ where: { kind: 'DATABOOK', sha256, status: 'COMMITTED' } });
  const fileName = args.fileName.replace(/[^\w .()\-,]/g, '_').slice(0, 200);

  const batch = await db.$transaction(async tx => {
    const b = await tx.importBatch.create({ data: {
      kind: 'DATABOOK', sourceSystem: 'EXCEL_TB', fileName, sha256, sizeBytes: args.bytes.byteLength, storageKey,
      rowCount: check?.parsed.entities.reduce((n, e) => n + e.accounts.length, 0) ?? 0,
      status: committed ? 'DUPLICATE' : !check || check.errors ? 'FAILED' : 'VALIDATED', uploadedById: user.id,
    } });
    const issues = [
      ...(committed ? [{ severity: 'ERROR' as const, code: 'DUPLICATE_FILE', message: `This exact file was already imported (batch ${committed.id}).` }] : []),
      ...(!through ? [{ severity: 'ERROR' as const, code: 'NO_DATA', message: 'No month with figures was found in the entity tabs.' }] : []),
      ...(check?.parsed.issues ?? []).map(i => ({ severity: i.severity, code: i.code, message: i.message, field: i.tab, rowNumber: i.row ?? null })),
    ];
    if (issues.length) await tx.validationIssue.createMany({ data: issues.map(i => ({ batchId: b.id, ...i })) });
    await audit(tx, { userId: user.id, action: 'IMPORT', objectType: 'ImportBatch', objectId: b.id,
      summary: `Uploaded Databook ${fileName} (${b.status.toLowerCase()}${through ? `, figures through ${through}` : ''})` });
    return b;
  });
  return { ok: true, batchId: batch.id };
}

export type ImportDatabook = { ok: true; summary: LoadSummary } |
  { ok: false; error: 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_VALIDATED' | 'HAS_ERRORS' | 'NEEDS_ACKNOWLEDGEMENT' | 'BAD_PERIOD' };

/**
 * Import a checked upload. A file whose figures don't tie to the Databook's own statements (beyond the recorded Databook
 * formula errors) can still be imported, but only with an explicit acknowledgement, which goes into the audit log.
 */
export async function importDatabookBatch(db: PrismaClient, user: Importer, args: {
  batchId: string; through: string; acknowledgement?: string;
}): Promise<ImportDatabook> {
  if (!user.permissions.has('ADMIN_COA')) return { ok: false, error: 'FORBIDDEN' };
  const batch = await db.importBatch.findUnique({ where: { id: args.batchId } });
  if (!batch || batch.kind !== 'DATABOOK') return { ok: false, error: 'NOT_FOUND' };
  if (batch.status !== 'VALIDATED') return { ok: false, error: 'NOT_VALIDATED' };
  if (!/^\d{4}-\d{2}$/.test(args.through) || !(await db.accountingPeriod.findUnique({ where: { key: args.through } })))
    return { ok: false, error: 'BAD_PERIOD' };

  const wb = await workbookFromStorage(batch.storageKey);
  const check = checkDatabook(wb, args.through);
  if (check.errors) return { ok: false, error: 'HAS_ERRORS' };
  const ack = (args.acknowledgement ?? '').trim();
  if (check.comparison.unexplained && ack.length < 10) return { ok: false, error: 'NEEDS_ACKNOWLEDGEMENT' };

  const summary = await loadDatabook(db, {
    parsed: check.parsed, userId: user.id, batchId: batch.id,
    file: { name: batch.fileName, sha256: batch.sha256, sizeBytes: batch.sizeBytes, storageKey: batch.storageKey },
  });
  await audit(db, { userId: user.id, action: 'IMPORT', objectType: 'ImportBatch', objectId: batch.id,
    summary: `Imported Databook through ${args.through}: ${summary.submissionsCreated} new versions, ${summary.submissionsUnchanged} unchanged` +
      (check.comparison.unexplained ? `; ${check.comparison.unexplained} unexplained differences acknowledged: ${ack}` : ''),
    after: { through: args.through, compared: check.comparison.compared, unexplained: check.comparison.unexplained, acknowledgement: ack || null } });
  return { ok: true, summary };
}
