// Statement inputs from the database: the TB submission in force per entity, through the mapping in force.
// Says exactly what is missing, unmapped or unapproved, so nothing is shown as final that isn't.

import type { PrismaClient, SubmissionStatus } from '@prisma/client';
import type { MappedBalance } from './engine';

export type Basis = 'APPROVED' | 'LATEST';

export type EntityInput = {
  entity: string;
  submission: { id: string; version: number; status: SubmissionStatus } | null;
  unmappedAccounts: string[];
  unapprovedMappings: number;
};

export type StatementInputs = {
  period: string;
  balances: MappedBalance[];
  entities: EntityInput[];
  /** True only when every entity has an approved TB and every line uses an approved mapping. */
  isFinal: boolean;
};

/**
 * basis APPROVED reads only approved submissions (a missing approval is reported as missing).
 * basis LATEST reads the newest non-superseded version, so results are labelled preliminary.
 */
export async function loadStatementInputs(db: PrismaClient, args: {
  periodKey: string; entityCodes: string[]; basis: Basis;
}): Promise<StatementInputs> {
  const period = await db.accountingPeriod.findUniqueOrThrow({ where: { key: args.periodKey } });
  const entities = await db.entity.findMany({ where: { code: { in: args.entityCodes } }, orderBy: { sortOrder: 'asc' } });

  const balances: MappedBalance[] = [];
  const out: EntityInput[] = [];
  let isFinal = true;

  for (const e of entities) {
    const submission = await db.tbSubmission.findFirst({
      where: { entityId: e.id, periodId: period.id,
        status: args.basis === 'APPROVED' ? 'APPROVED' : { in: ['APPROVED', 'VALIDATED', 'DRAFT'] } },
      orderBy: [{ version: 'desc' }],
      include: {
        lines: { include: { sourceAccount: { include: {
          mappings: {
            where: { status: { not: 'REJECTED' }, effectiveFrom: { lte: period.endDate } },
            orderBy: { effectiveFrom: 'desc' }, take: 1,
            include: { stdAccount: { include: { statementLine: { select: { code: true } } } } },
          },
        } } } },
      },
    });
    const info: EntityInput = {
      entity: e.code,
      submission: submission ? { id: submission.id, version: submission.version, status: submission.status } : null,
      unmappedAccounts: [], unapprovedMappings: 0,
    };
    if (!submission || submission.status !== 'APPROVED') isFinal = false;

    for (const line of submission?.lines ?? []) {
      const m = line.sourceAccount.mappings[0];
      if (!m) { info.unmappedAccounts.push(line.sourceAccount.code); continue; }
      if (m.status !== 'APPROVED') info.unapprovedMappings++;
      balances.push({ entity: e.code, lineCode: m.stdAccount.statementLine.code, balance: line.reportingBalance.toString() });
    }
    if (info.unmappedAccounts.length || info.unapprovedMappings) isFinal = false;
    out.push(info);
  }
  return { period: period.key, balances, entities: out, isFinal };
}
