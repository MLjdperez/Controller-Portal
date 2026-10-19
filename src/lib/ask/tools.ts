// Read-only tools Claude can call to answer questions about the statements. Every tool runs on the server with the
// asking user's entity scope: Claude only ever sees figures that user could see on screen. Nothing writes.

import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { Decimal } from '../money';
import { ALL_LINES, BS_LINES, PL_LINES, PL_MEMO_LINES } from '../statements/layout';
import { computeStatements, CONSOLIDATED } from '../statements/engine';
import { loadStatementInputs } from '../statements/load';
import { detailLinesOf, present, previousPeriodKey } from '../statements/present';
import { buildView } from '../statements/view';

export type AskScope = { entityCodes: string[]; canConsolidate: boolean };

const Period = z.string().regex(/^\d{4}-\d{2}$/, 'period must be YYYY-MM');
const EntityCol = z.string().min(2).max(14);

export const TOOL_DEFS = [
  {
    name: 'get_statement',
    description:
      'Balance sheet (BS) or P&L (PL) for one period: every line for each entity the user can see, plus CONSOLIDATED when available. ' +
      'Figures use natural signs (revenue, profit, assets, liabilities and equity positive; costs negative). PL view "ytd" is year to date; ' +
      '"month" is the single month. The PL includes the EBITDA reconciliation. Also returns whether the figures are final or preliminary and why.',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: { type: 'string', description: 'YYYY-MM, e.g. 2026-09' },
        statement: { type: 'string', enum: ['BS', 'PL'] },
        view: { type: 'string', enum: ['ytd', 'month'], description: 'PL only; ignored for BS' },
      },
      required: ['period', 'statement', 'view'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'get_line_accounts',
    description:
      'The source accounts behind one statement line for one entity (or CONSOLIDATED), year-to-date balances in natural signs, ' +
      'largest first. Use it to explain what drives a figure.',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: { type: 'string', description: 'YYYY-MM' },
        line_code: { type: 'string', description: 'A code from the statement, e.g. PL.PRODUCT_SALES, BS.INVENTORY, PL.EBITDA' },
        entity: { type: 'string', description: 'Entity code (MLB, MLF, MLL, GSA, LSA, ELIM) or CONSOLIDATED' },
        limit: { type: 'integer', description: 'Max accounts to return (1-50)' },
      },
      required: ['period', 'line_code', 'entity', 'limit'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'get_account_history',
    description:
      'Month-end balances of one source account across periods (cumulative; P&L accounts are year to date), raw signs ' +
      '(debit positive, credit negative), from the latest submission of each period.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entity: { type: 'string', description: 'Entity code' },
        account_code: { type: 'string', description: 'Account number as shown, e.g. 40000-001-00' },
      },
      required: ['entity', 'account_code'],
      additionalProperties: false,
    },
    strict: true,
  },
];

const fmt = (v: Decimal) => v.toDecimalPlaces(2).toFixed(2);

function columnsFor(scope: AskScope) {
  return scope.canConsolidate ? [...scope.entityCodes, CONSOLIDATED] : scope.entityCodes;
}

async function getStatement(db: PrismaClient, scope: AskScope, raw: unknown) {
  const a = z.object({ period: Period, statement: z.enum(['BS', 'PL']), view: z.enum(['ytd', 'month']) }).parse(raw);
  const exists = await db.accountingPeriod.findUnique({ where: { key: a.period } });
  if (!exists) return { error: `No period ${a.period}` };
  const inputs = await loadStatementInputs(db, { periodKey: a.period, entityCodes: scope.entityCodes, basis: 'LATEST' });
  if (inputs.entities.every(e => !e.submission)) return { error: `No trial balances loaded for ${a.period}` };
  const result = computeStatements(inputs.balances, scope.entityCodes);
  const monthView = a.statement === 'PL' && a.view === 'month';
  let prior = null;
  if (monthView && !a.period.endsWith('-01')) {
    const pi = await loadStatementInputs(db, { periodKey: previousPeriodKey(a.period), entityCodes: scope.entityCodes, basis: 'LATEST' });
    prior = computeStatements(pi.balances, scope.entityCodes);
  }
  const columns = columnsFor(scope);
  const rows = buildView({ stmt: a.statement, monthView, signs: 'natural', locale: 'en', columns, result, prior,
    isFirstMonth: a.period.endsWith('-01') });
  return {
    period: a.period, statement: a.statement, view: a.statement === 'PL' ? a.view : 'balance at period end',
    status: inputs.isFinal ? 'FINAL' : 'PRELIMINARY',
    not_final_because: inputs.entities.flatMap(e => [
      ...(!e.submission ? [`${e.entity}: no trial balance`] : []),
      ...(e.submission && e.submission.status !== 'APPROVED' ? [`${e.entity}: TB v${e.submission.version} ${e.submission.status.toLowerCase()}`] : []),
      ...(e.unapprovedMappings ? [`${e.entity}: ${e.unapprovedMappings} mappings not approved`] : []),
      ...(e.unmappedAccounts.length ? [`${e.entity}: ${e.unmappedAccounts.length} unmapped accounts excluded`] : []),
    ]),
    columns,
    rows: rows.filter(r => r.kind !== 'MEMO_HEADER').map(r => ({
      line_code: r.lineCode ?? r.key, label: r.label, kind: r.kind,
      values: Object.fromEntries(columns.map((c, i) => {
        const v = r.values[i];
        return [c, v === null || v === undefined ? null : r.kind === 'RATIO' ? Number(v.toFixed(4)) : fmt(v)];
      })),
    })),
  };
}

async function getLineAccounts(db: PrismaClient, scope: AskScope, raw: unknown) {
  const a = z.object({ period: Period, line_code: z.string(), entity: EntityCol, limit: z.number().int().min(1).max(50) }).parse(raw);
  const line = ALL_LINES.find(l => l.code === a.line_code);
  if (!line) return { error: `Unknown line ${a.line_code}`, valid_codes: [...BS_LINES, ...PL_LINES, ...PL_MEMO_LINES].map(l => l.code) };
  if (a.entity === CONSOLIDATED ? !scope.canConsolidate : !scope.entityCodes.includes(a.entity))
    return { error: `Entity ${a.entity} is not available to this user` };
  const entities = a.entity === CONSOLIDATED ? scope.entityCodes : [a.entity];
  const inputs = await loadStatementInputs(db, { periodKey: a.period, entityCodes: entities, basis: 'LATEST' });
  const wanted = new Set(detailLinesOf(line.code));
  const rows = inputs.details.filter(d => wanted.has(d.lineCode))
    .map(d => ({ ...d, shown: present(line.code, new Decimal(d.balance), 'natural') }))
    .filter(d => !d.shown.isZero())
    .sort((x, y) => y.shown.abs().comparedTo(x.shown.abs()));
  const total = rows.reduce((t, r) => t.plus(r.shown), new Decimal(0));
  return {
    period: a.period, line_code: line.code, line: line.nameEn, entity: a.entity, basis: 'year to date',
    total: fmt(total), account_count: rows.length,
    accounts: rows.slice(0, a.limit).map(r => ({
      entity: r.entity, account: r.accountCode, name: r.accountName, statement_line: r.lineCode, balance: fmt(r.shown),
    })),
    omitted: Math.max(0, rows.length - a.limit),
  };
}

async function getAccountHistory(db: PrismaClient, scope: AskScope, raw: unknown) {
  const a = z.object({ entity: EntityCol, account_code: z.string().min(1).max(80) }).parse(raw);
  if (!scope.entityCodes.includes(a.entity)) return { error: `Entity ${a.entity} is not available to this user` };
  const acct = await db.sourceAccount.findFirst({ where: { code: a.account_code, entity: { code: a.entity } } });
  if (!acct) return { error: `No account ${a.account_code} in ${a.entity}` };
  const lines = await db.tbLine.findMany({
    where: { sourceAccountId: acct.id, submission: { status: { not: 'SUPERSEDED' } } },
    include: { submission: { include: { period: true } } },
  });
  const latest = new Map<string, (typeof lines)[number]>();
  for (const l of lines) {
    const k = l.submission.period.key;
    if (!latest.has(k) || latest.get(k)!.submission.version < l.submission.version) latest.set(k, l);
  }
  return {
    entity: a.entity, account: acct.code, name: acct.nameEn ?? acct.nameSource, statement: acct.statement, signs: 'raw (debit +, credit -)',
    balances: [...latest.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([period, l]) => ({ period, balance: fmt(new Decimal(l.balance.toString())) })),
  };
}

/** Run one tool call. Errors come back as data so Claude can correct itself; nothing throws to the loop. */
export async function runTool(db: PrismaClient, scope: AskScope, name: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  try {
    const out = name === 'get_statement' ? await getStatement(db, scope, input)
      : name === 'get_line_accounts' ? await getLineAccounts(db, scope, input)
      : name === 'get_account_history' ? await getAccountHistory(db, scope, input)
      : { error: `Unknown tool ${name}` };
    return { content: JSON.stringify(out), isError: 'error' in out };
  } catch (e) {
    return { content: JSON.stringify({ error: e instanceof z.ZodError ? e.issues.map(i => i.message).join('; ') : 'Tool failed' }), isError: true };
  }
}
