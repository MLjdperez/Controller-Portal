// Trial balance upload: receive a file → validate → preview against the current version → commit as a new version.
// Controls (master prompt §27): original kept by SHA-256; the same file can't be committed twice for an entity and period;
// a correction is version n+1 (never an edit); locked periods refuse; new accounts need a proposed mapping; all audited.

import type { Permission, PrismaClient } from '@prisma/client';
import { audit } from '../audit-core';
import { Decimal, ZERO, toDebitCredit } from '../money';
import { readStored, storeUpload } from '../storage';
import { parseTbFile } from './read';
import type { Issue, TbLineParsed, TbParse } from './parse';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type Uploader = { id: string; permissions: Set<Permission>; entityIds: string[] };

export type ReceiveResult = { ok: true; batchId: string } | { ok: false; error: 'FORBIDDEN' | 'OUT_OF_SCOPE' | 'BAD_FILE_TYPE' | 'TOO_LARGE' | 'EMPTY' | 'NO_PERIOD' | 'PERIOD_LOCKED' };

export async function receiveUpload(db: PrismaClient, user: Uploader, args: {
  entityCode: string; periodKey: string; fileName: string; bytes: Uint8Array;
}): Promise<ReceiveResult> {
  if (!user.permissions.has('UPLOAD_TB')) return { ok: false, error: 'FORBIDDEN' };
  const entity = await db.entity.findUnique({ where: { code: args.entityCode } });
  if (!entity || !user.entityIds.includes(entity.id) || entity.kind !== 'LEGAL') return { ok: false, error: 'OUT_OF_SCOPE' };
  if (!/\.(xlsx|csv)$/i.test(args.fileName)) return { ok: false, error: 'BAD_FILE_TYPE' };
  if (args.bytes.byteLength === 0) return { ok: false, error: 'EMPTY' };
  if (args.bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, error: 'TOO_LARGE' };
  const period = await db.accountingPeriod.findUnique({ where: { key: args.periodKey } });
  if (!period) return { ok: false, error: 'NO_PERIOD' };
  const ep = await db.entityPeriod.findUnique({ where: { entityId_periodId: { entityId: entity.id, periodId: period.id } } });
  if (ep?.status === 'LOCKED') return { ok: false, error: 'PERIOD_LOCKED' };

  const { sha256, storageKey } = await storeUpload(args.fileName, args.bytes);
  const fileName = args.fileName.replace(/[^\w .()\-áéíóúñÁÉÍÓÚÑ,]/g, '_').slice(0, 200);
  const duplicateOf = await db.importBatch.findFirst({
    where: { sha256, entityId: entity.id, periodId: period.id, status: 'COMMITTED' } });

  let parsed: TbParse;
  try { parsed = await parseTbFile(args.fileName, args.bytes, entity.functionalCurrency); }
  catch { parsed = { headerRow: null, columns: {}, signMode: null, groupRowsSkipped: 0, lines: [], totals: { balance: ZERO, reporting: ZERO },
    issues: [{ severity: 'ERROR', code: 'UNREADABLE', message: 'The file could not be read as Excel or CSV.' }] }; }

  const issues: Issue[] = duplicateOf
    ? [{ severity: 'ERROR', code: 'DUPLICATE_FILE', message: `This exact file was already committed for ${entity.code} ${period.key} (batch ${duplicateOf.id}).` }, ...parsed.issues]
    : parsed.issues;
  const failed = issues.some(i => i.severity === 'ERROR');

  const batch = await db.$transaction(async tx => {
    const b = await tx.importBatch.create({ data: {
      kind: 'TRIAL_BALANCE', sourceSystem: entity.sourceSystem === 'QUICKBOOKS' ? 'QUICKBOOKS' : entity.sourceSystem === 'SAGE100' ? 'SAGE100' : 'EXCEL_TB',
      entityId: entity.id, periodId: period.id, fileName, sha256, sizeBytes: args.bytes.byteLength, storageKey,
      rowCount: parsed.lines.length, status: duplicateOf ? 'DUPLICATE' : failed ? 'FAILED' : 'VALIDATED', uploadedById: user.id,
    } });
    if (issues.length) await tx.validationIssue.createMany({ data: issues.map(i => ({
      batchId: b.id, severity: i.severity, code: i.code, rowNumber: i.row ?? null, message: i.message })) });
    await audit(tx, { userId: user.id, action: 'IMPORT', objectType: 'ImportBatch', objectId: b.id, entityId: entity.id,
      summary: `Uploaded ${fileName} for ${entity.code} ${period.key}: ${parsed.lines.length} accounts, ${b.status.toLowerCase()}` });
    return b;
  });
  return { ok: true, batchId: batch.id };
}

export type Change = { code: string; name: string; before: Decimal | null; after: Decimal | null; diff: Decimal };

export type Preview = {
  batch: NonNullable<Awaited<ReturnType<typeof loadBatch>>>;
  parsed: TbParse & { sheet: string | null };
  current: { id: string; version: number; status: string; batchFile: string } | null;
  changes: Change[];
  removed: Change[];
  newAccounts: (TbLineParsed & { suggestion: string | null })[];
  unchanged: boolean;
};

async function loadBatch(db: PrismaClient, user: Uploader, batchId: string) {
  const batch = await db.importBatch.findUnique({ where: { id: batchId },
    include: { entity: true, period: true, uploadedBy: { select: { id: true, fullName: true } }, issues: true } });
  if (!batch || batch.kind !== 'TRIAL_BALANCE' || !batch.entityId || !user.entityIds.includes(batch.entityId)) return null;
  return batch;
}

export async function previewBatch(db: PrismaClient, user: Uploader, batchId: string): Promise<Preview | null> {
  const batch = await loadBatch(db, user, batchId);
  if (!batch || !batch.entity || !batch.period) return null;
  const parsed = await parseTbFile(batch.fileName, await readStored(batch.storageKey), batch.entity.functionalCurrency);

  const current = await db.tbSubmission.findFirst({
    where: { entityId: batch.entityId!, periodId: batch.periodId!, status: { not: 'SUPERSEDED' } }, orderBy: { version: 'desc' },
    include: { batch: { select: { fileName: true } }, lines: { include: { sourceAccount: { select: { code: true, nameEn: true, nameSource: true } } } } },
  });
  // Compare in reporting currency (what the statements use).
  const before = new Map((current?.lines ?? []).map(l => [l.sourceAccount.code,
    { v: new Decimal(l.reportingBalance.toString()), name: l.sourceAccount.nameEn ?? l.sourceAccount.nameSource }]));
  const after = new Map(parsed.lines.map(l => [l.code, l]));
  const changes: Change[] = [];
  for (const l of parsed.lines) {
    const b = before.get(l.code)?.v ?? null;
    const diff = l.reporting.minus(b ?? ZERO);
    if (!diff.abs().lt('0.005')) changes.push({ code: l.code, name: l.name, before: b, after: l.reporting, diff });
  }
  const removed: Change[] = [...before.entries()].filter(([code, b]) => !after.has(code) && !b.v.isZero())
    .map(([code, b]) => ({ code, name: b.name, before: b.v, after: null, diff: b.v.negated() }));
  changes.sort((x, y) => y.diff.abs().comparedTo(x.diff.abs()));

  const known = new Set((await db.sourceAccount.findMany({ where: { entityId: batch.entityId! }, select: { code: true } })).map(a => a.code));
  const newAccounts = await Promise.all(parsed.lines.filter(l => !known.has(l.code)).map(async l => ({ ...l, suggestion: await suggestStdAccount(db, batch.entityId!, l.code) })));

  return {
    batch, parsed,
    current: current ? { id: current.id, version: current.version, status: current.status, batchFile: current.batch.fileName } : null,
    changes, removed, newAccounts,
    unchanged: !!current && changes.length === 0 && removed.length === 0,
  };
}

/**
 * Suggest a standard account for a new code: the mapping of the existing account in the same entity that shares the
 * longest code prefix. A suggestion only pre-fills the form; the mapping is still PROPOSED and needs approval.
 */
export async function suggestStdAccount(db: PrismaClient, entityId: string, code: string): Promise<string | null> {
  for (let n = code.length - 1; n >= 2; n--) {
    const m = await db.accountMapping.findFirst({
      where: { status: { not: 'REJECTED' }, sourceAccount: { entityId, code: { startsWith: code.slice(0, n) } } },
      orderBy: { effectiveFrom: 'desc' }, select: { stdAccountId: true } });
    if (m) return m.stdAccountId;
  }
  return null;
}

export type CommitResult = { ok: true; submissionId: string; version: number } |
  { ok: false; error: 'NOT_FOUND' | 'FORBIDDEN' | 'NOT_VALIDATED' | 'HAS_ERRORS' | 'MAPPING_MISSING' | 'PERIOD_LOCKED' | 'UNCHANGED' };

export async function commitBatch(db: PrismaClient, user: Uploader, batchId: string, mappings: Record<string, string>): Promise<CommitResult> {
  if (!user.permissions.has('UPLOAD_TB')) return { ok: false, error: 'FORBIDDEN' };
  const p = await previewBatch(db, user, batchId);
  if (!p) return { ok: false, error: 'NOT_FOUND' };
  const { batch, parsed } = p;
  if (batch.status !== 'VALIDATED') return { ok: false, error: 'NOT_VALIDATED' };
  if (parsed.issues.some(i => i.severity === 'ERROR')) return { ok: false, error: 'HAS_ERRORS' };
  if (p.unchanged) return { ok: false, error: 'UNCHANGED' };
  const std = await db.stdAccount.findMany({ where: { id: { in: Object.values(mappings) } }, include: { statementLine: true } });
  if (p.newAccounts.some(a => !std.some(s => s.id === mappings[a.code]))) return { ok: false, error: 'MAPPING_MISSING' };
  const entity = batch.entity!, period = batch.period!;
  const foreign = entity.functionalCurrency !== 'USD';

  return db.$transaction(async tx => {
    const ep = await tx.entityPeriod.findUnique({ where: { entityId_periodId: { entityId: entity.id, periodId: period.id } } });
    if (ep?.status === 'LOCKED') return { ok: false, error: 'PERIOD_LOCKED' } as const;

    // New accounts, each with a PROPOSED mapping effective from this period.
    for (const a of p.newAccounts) {
      const s = std.find(x => x.id === mappings[a.code])!;
      const acct = await tx.sourceAccount.create({ data: { entityId: entity.id, code: a.code, nameSource: a.name || a.code, statement: s.statementLine.statement } });
      await tx.accountMapping.create({ data: { sourceAccountId: acct.id, stdAccountId: s.id, effectiveFrom: period.startDate,
        status: 'PROPOSED', reason: `New account in ${batch.fileName}`, preparedById: user.id } });
    }
    const accounts = new Map((await tx.sourceAccount.findMany({ where: { entityId: entity.id, code: { in: parsed.lines.map(l => l.code) } } })).map(a => [a.code, a.id]));

    const max = await tx.tbSubmission.aggregate({ where: { entityId: entity.id, periodId: period.id }, _max: { version: true } });
    const version = (max._max.version ?? 0) + 1;
    const prior = p.current && p.current.status !== 'APPROVED' ? p.current : null;
    if (prior) await tx.tbSubmission.update({ where: { id: prior.id }, data: { status: 'SUPERSEDED' } });
    const sub = await tx.tbSubmission.create({ data: {
      entityId: entity.id, periodId: period.id, version, status: 'VALIDATED', batchId: batch.id,
      currency: entity.functionalCurrency, reportingCurrency: 'USD', translationSource: foreign ? 'SOURCE_FILE' : 'NONE',
      supersedesId: prior?.id ?? null, preparedById: user.id,
    } });
    await tx.tbLine.createMany({ data: parsed.lines.map(l => {
      const { debit, credit } = toDebitCredit(l.balance);
      return { submissionId: sub.id, sourceAccountId: accounts.get(l.code)!, rowNumber: l.row,
        debit: debit.toFixed(6), credit: credit.toFixed(6), balance: l.balance.toFixed(6), reportingBalance: l.reporting.toFixed(6),
        ...(foreign && !l.balance.isZero() ? { rate: l.reporting.div(l.balance).toDecimalPlaces(8).toFixed(8), rateType: 'CLOSING' as const } : {}) };
    }) });
    await tx.importBatch.update({ where: { id: batch.id }, data: { status: 'COMMITTED', committedAt: new Date() } });
    await audit(tx, { userId: user.id, action: 'SUBMIT', objectType: 'TbSubmission', objectId: sub.id, entityId: entity.id,
      summary: `Submitted ${entity.code} ${period.key} TB v${version} from ${batch.fileName}: ${parsed.lines.length} accounts, ` +
        `${p.changes.length} changed, ${p.removed.length} removed, ${p.newAccounts.length} new` + (prior ? `; v${prior.version} superseded` : ''),
      after: { batchId: batch.id, version, newAccounts: p.newAccounts.map(a => a.code), removed: p.removed.map(r => r.code) } });
    return { ok: true, submissionId: sub.id, version } as const;
  }, { timeout: 120_000 });
}

export async function discardBatch(db: PrismaClient, user: Uploader, batchId: string): Promise<boolean> {
  const batch = await loadBatch(db, user, batchId);
  if (!batch || !['VALIDATED', 'FAILED', 'DUPLICATE'].includes(batch.status) || batch.status === 'COMMITTED') return false;
  await db.$transaction(async tx => {
    await tx.importBatch.update({ where: { id: batchId }, data: { status: 'FAILED' } });
    await tx.validationIssue.create({ data: { batchId, severity: 'WARNING', code: 'DISCARDED', message: 'Discarded by the uploader before commit.' } });
    await audit(tx, { userId: user.id, action: 'UPDATE', objectType: 'ImportBatch', objectId: batchId, entityId: batch.entityId,
      summary: `Discarded upload ${batch.fileName}` });
  });
  return true;
}
