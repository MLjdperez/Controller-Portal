import 'server-only';
import { db } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { ENTITIES } from '@/lib/reference';
import { computeStatements, CONSOLIDATED, type StatementResult } from '@/lib/statements/engine';
import { loadStatementInputs, type StatementInputs } from '@/lib/statements/load';
import { previousPeriodKey } from '@/lib/statements/present';
import { buildView } from '@/lib/statements/view';
import type { Messages } from '@/messages/en';
import type { StatementParams } from './params';

/** Entity codes the user may see, in group order, and whether the consolidated column may be shown. */
export async function visibleEntities(s: SessionUser) {
  const rows = await db.entity.findMany({ where: { id: { in: s.entityIds } }, select: { code: true } });
  const allowed = new Set(rows.map(r => r.code));
  const codes = ENTITIES.map(e => e.code).filter(c => allowed.has(c));
  // A consolidation of a partial group would be a number nobody reports; show it only with every entity in scope.
  return { codes, canConsolidate: codes.length === ENTITIES.length };
}

export async function resolvePeriod(key: string | undefined) {
  const periods = await db.accountingPeriod.findMany({ orderBy: [{ fiscalYear: 'desc' }, { month: 'desc' }] });
  const withData = new Set((await db.tbSubmission.findMany({ distinct: ['periodId'], select: { periodId: true } })).map(r => r.periodId));
  const loaded = periods.filter(p => withData.has(p.id));
  const period = periods.find(p => p.key === key) ?? loaded[0] ?? periods[0];
  return { period, periods: loaded.length ? loaded : periods };
}

export type StatementData = {
  inputs: StatementInputs;
  result: StatementResult;
  /** PL month view only: prior period's result, or null when it isn't loaded. */
  prior: StatementResult | null;
  priorMissing: boolean;
  isFirstMonth: boolean;
};

export async function statementData(p: StatementParams, periodKey: string, entities: string[]): Promise<StatementData> {
  const inputs = await loadStatementInputs(db, { periodKey, entityCodes: entities, basis: p.basis });
  const result = computeStatements(inputs.balances, entities);
  const isFirstMonth = periodKey.endsWith('-01');
  let prior: StatementResult | null = null;
  let priorMissing = false;
  if (p.stmt === 'PL' && p.view === 'month' && !isFirstMonth) {
    const prevKey = previousPeriodKey(periodKey);
    const exists = await db.accountingPeriod.findUnique({ where: { key: prevKey } });
    if (exists) {
      const pi = await loadStatementInputs(db, { periodKey: prevKey, entityCodes: entities, basis: p.basis });
      priorMissing = pi.entities.some(e => !e.submission);
      prior = computeStatements(pi.balances, entities);
    } else priorMissing = true;
  }
  return { inputs, result, prior, priorMissing, isFirstMonth };
}

/** Why the statement isn't final, in the user's language. */
export function preliminaryReasons(inputs: StatementInputs, t: Messages): string[] {
  const reasons: string[] = [];
  for (const e of inputs.entities) {
    if (!e.submission) reasons.push(t.statements.missingTb(e.entity));
    else if (e.submission.status !== 'APPROVED' || e.unapprovedMappings)
      reasons.push(t.statements.unapproved(e.entity, t.submissionStatus[e.submission.status], e.submission.version, e.unapprovedMappings));
    if (e.unmappedAccounts.length) reasons.push(t.statements.unmapped(e.entity, e.unmappedAccounts.length));
  }
  return reasons;
}

/** Everything the screen and the download show, built once. */
export async function statementView(s: SessionUser, p: StatementParams, periodKey: string) {
  const { codes, canConsolidate } = await visibleEntities(s);
  const data = await statementData(p, periodKey, codes);
  const columns = canConsolidate ? [...codes, CONSOLIDATED] : codes;
  const monthView = p.stmt === 'PL' && p.view === 'month';
  const rows = buildView({ stmt: p.stmt, monthView, signs: p.signs, locale: s.locale, columns,
    result: data.result, prior: data.prior, isFirstMonth: data.isFirstMonth });
  return { columns, canConsolidate, monthView, data, rows };
}

export { CONSOLIDATED };
