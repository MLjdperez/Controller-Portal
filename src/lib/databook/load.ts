// Load a parsed Databook into the portal: COA, source accounts, mappings, and one TB submission per entity and period.
//
// Controls
// - Idempotent: the same file (SHA-256) is committed once; a re-run records a DUPLICATE batch and changes nothing.
// - Versioned: a period whose figures changed gets version n+1; version n is SUPERSEDED, never edited.
//   An APPROVED version stays approved until its successor is approved.
// - Mappings from the Databook's L1/L2 arrive PROPOSED. They need a second person's approval, and until then
//   statements built on them are preliminary.
// - Submissions arrive VALIDATED, prepared by the importing user, for the Controller to approve.

import type { Prisma, PrismaClient } from '@prisma/client';
import { Decimal, toDebitCredit } from '../money';
import { ALL_LINES } from '../statements/layout';
import { audit } from '../audit-core';
import type { ParsedAccount, ParsedDatabook } from './parse';

export type LoadSummary = {
  batchId: string;
  status: 'COMMITTED' | 'DUPLICATE';
  statementLines: number;
  stdAccounts: number;
  sourceAccountsCreated: number;
  mappingsProposed: number;
  submissionsCreated: number;
  submissionsUnchanged: number;
};

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'GENERAL';

export const stdAccountCode = (a: Pick<ParsedAccount, 'lineCode' | 'l2'>) => `${a.lineCode}.${slug(a.l2)}`;

/** Fingerprint of a submission's lines, so an unchanged period is not loaded again. */
const fingerprint = (lines: { code: string; balance: Decimal }[]) =>
  lines.map(l => `${l.code}=${l.balance.toFixed(6)}`).sort().join('|');

export async function loadDatabook(db: PrismaClient, args: {
  parsed: ParsedDatabook;
  file: { name: string; sha256: string; sizeBytes: number; storageKey: string };
  userId: string;
}): Promise<LoadSummary> {
  const { parsed, file, userId } = args;
  const errors = parsed.issues.filter(i => i.severity === 'ERROR');
  if (errors.length) throw new Error(`Databook has ${errors.length} errors; first: ${errors[0]!.message}`);

  const committed = await db.importBatch.findFirst({ where: { sha256: file.sha256, kind: 'DATABOOK', status: 'COMMITTED' } });
  if (committed) {
    const dup = await db.importBatch.create({
      data: { kind: 'DATABOOK', sourceSystem: 'EXCEL_TB', fileName: file.name, sha256: file.sha256, sizeBytes: file.sizeBytes,
        storageKey: file.storageKey, status: 'DUPLICATE', uploadedById: userId },
    });
    await audit(db, { userId, action: 'IMPORT', objectType: 'ImportBatch', objectId: dup.id,
      summary: `Databook ${file.name} already committed as ${committed.id}; nothing loaded` });
    return { batchId: dup.id, status: 'DUPLICATE', statementLines: 0, stdAccounts: 0, sourceAccountsCreated: 0,
      mappingsProposed: 0, submissionsCreated: 0, submissionsUnchanged: 0 };
  }

  return db.$transaction(async tx => {
    const s: LoadSummary = { batchId: '', status: 'COMMITTED', statementLines: 0, stdAccounts: 0,
      sourceAccountsCreated: 0, mappingsProposed: 0, submissionsCreated: 0, submissionsUnchanged: 0 };

    const rowCount = parsed.entities.reduce((n, e) => n + e.accounts.length, 0);
    const batch = await tx.importBatch.create({
      data: { kind: 'DATABOOK', sourceSystem: 'EXCEL_TB', fileName: file.name, sha256: file.sha256, sizeBytes: file.sizeBytes,
        storageKey: file.storageKey, rowCount, status: 'VALIDATED', uploadedById: userId },
    });
    s.batchId = batch.id;
    if (parsed.issues.length)
      await tx.validationIssue.createMany({ data: parsed.issues.map(i => ({
        batchId: batch.id, severity: i.severity, code: i.code, rowNumber: i.row ?? null, field: i.tab, message: i.message })) });

    // Presentation lines.
    const lineIds = new Map<string, string>();
    for (const [i, l] of ALL_LINES.entries()) {
      const data = { statement: l.statement, nameEn: l.nameEn, nameEs: l.nameEs, kind: l.kind, sortOrder: (i + 1) * 10, sumOf: l.sumOf ?? [] };
      const row = await tx.statementLine.upsert({ where: { code: l.code }, update: data, create: { code: l.code, ...data } });
      lineIds.set(l.code, row.id);
    }
    s.statementLines = lineIds.size;

    // Standard accounts: one per (L1 line, L2).
    const stdIds = new Map<string, string>();
    for (const a of parsed.entities.flatMap(e => e.accounts)) {
      const code = stdAccountCode(a);
      if (stdIds.has(code)) continue;
      const row = await tx.stdAccount.upsert({
        where: { code }, update: {},
        create: { code, nameEn: a.l2, statementLineId: lineIds.get(a.lineCode)!, isIntercompany: a.isIntercompany },
      });
      stdIds.set(code, row.id);
    }
    s.stdAccounts = stdIds.size;

    const entityRows = await tx.entity.findMany();
    const entityId = new Map(entityRows.map(e => [e.code, e.id]));
    const periods = new Map((await tx.accountingPeriod.findMany()).map(p => [p.key, p]));
    const asOf = periods.get(parsed.periods[0]!)?.startDate ?? new Date('2024-12-01');

    for (const pe of parsed.entities) {
      const eid = entityId.get(pe.entity);
      if (!eid) throw new Error(`Entity ${pe.entity} is not seeded`);
      const ent = entityRows.find(e => e.id === eid)!;

      // Source accounts and their mapping.
      const accountIds = new Map<string, string>();
      for (const a of pe.accounts) {
        let acct = await tx.sourceAccount.findUnique({ where: { entityId_code: { entityId: eid, code: a.code } } });
        if (!acct) {
          acct = await tx.sourceAccount.create({ data: {
            entityId: eid, code: a.code, nameSource: a.nameSource, nameEn: a.nameEn, statement: a.statement,
            bsType: a.bsType, accountType: a.accountType, groupLabel: a.l3, isIntercompany: a.isIntercompany,
            icCounterpartyId: a.icCounterparty ? entityId.get(a.icCounterparty) ?? null : null,
            eliminationRefs: a.eliminationRefs,
          } });
          s.sourceAccountsCreated++;
        }
        accountIds.set(a.code, acct.id);

        const target = stdIds.get(stdAccountCode(a))!;
        const current = await tx.accountMapping.findFirst({
          where: { sourceAccountId: acct.id, status: { not: 'REJECTED' } }, orderBy: { effectiveFrom: 'desc' },
        });
        if (!current || current.stdAccountId !== target) {
          // A changed classification takes effect from this load, so prior periods keep the mapping they were reported on.
          const effectiveFrom = current ? new Date(new Date().toISOString().slice(0, 10)) : asOf;
          await tx.accountMapping.upsert({
            where: { sourceAccountId_effectiveFrom: { sourceAccountId: acct.id, effectiveFrom } },
            update: { stdAccountId: target, status: 'PROPOSED', preparedById: userId, approvedById: null, approvedAt: null },
            create: { sourceAccountId: acct.id, stdAccountId: target, effectiveFrom, status: 'PROPOSED',
              reason: current ? 'Databook L1/L2 changed' : 'From Databook L1/L2', preparedById: userId },
          });
          s.mappingsProposed++;
        }
      }

      // One submission per period, only when the figures changed.
      for (const key of parsed.periods) {
        const period = periods.get(key);
        if (!period) throw new Error(`Period ${key} is not seeded`);
        const lines = pe.accounts.map(a => ({ code: a.code, balance: a.balances.get(key)! }));
        const latest = await tx.tbSubmission.findFirst({
          where: { entityId: eid, periodId: period.id, status: { not: 'SUPERSEDED' } }, orderBy: { version: 'desc' },
          include: { lines: { include: { sourceAccount: { select: { code: true } } } } },
        });
        if (latest && fingerprint(latest.lines.map(l => ({ code: l.sourceAccount.code, balance: new Decimal(l.balance.toString()) })))
            === fingerprint(lines)) { s.submissionsUnchanged++; continue; }

        const max = await tx.tbSubmission.aggregate({ where: { entityId: eid, periodId: period.id }, _max: { version: true } });
        const sub = await tx.tbSubmission.create({ data: {
          entityId: eid, periodId: period.id, version: (max._max.version ?? 0) + 1, status: 'VALIDATED', batchId: batch.id,
          // LSA keeps NIO books, but the Databook delivers its figures in USD (handoff D4): taken as given.
          currency: 'USD', reportingCurrency: 'USD',
          translationSource: ent.functionalCurrency === 'USD' ? 'NONE' : 'DATABOOK',
          supersedesId: latest && latest.status !== 'APPROVED' ? latest.id : null,
          preparedById: userId,
        } });
        if (latest && latest.status !== 'APPROVED')
          await tx.tbSubmission.update({ where: { id: latest.id }, data: { status: 'SUPERSEDED' } });
        await tx.tbLine.createMany({ data: pe.accounts.map(a => {
          const balance = a.balances.get(key)!;
          const { debit, credit } = toDebitCredit(balance);
          return { submissionId: sub.id, sourceAccountId: accountIds.get(a.code)!, rowNumber: a.rows[0] ?? null,
            debit: debit.toFixed(6), credit: credit.toFixed(6), balance: balance.toFixed(6), reportingBalance: balance.toFixed(6) };
        }) });
        s.submissionsCreated++;
      }
    }

    await tx.importBatch.update({ where: { id: batch.id }, data: { status: 'COMMITTED', committedAt: new Date() } });
    await audit(tx, { userId, action: 'IMPORT', objectType: 'ImportBatch', objectId: batch.id,
      summary: `Databook ${file.name}: ${s.submissionsCreated} submissions, ${s.sourceAccountsCreated} new accounts, ${s.mappingsProposed} mappings proposed`,
      after: { ...s } as Prisma.InputJsonValue });
    return s;
  }, { timeout: 300_000, maxWait: 30_000 });
}
