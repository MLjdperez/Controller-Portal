// Every check on a Databook workbook, before anything touches the database: parse, opening roll-forward, TB balance
// per entity and period, and the portal's statements against the Databook's own. Shared by the import page and scripts.

import type { Workbook } from 'exceljs';
import type { PrismaClient } from '@prisma/client';
import { Decimal, cents } from '../money';
import { computeStatements, CONSOLIDATED, type MappedBalance } from '../statements/engine';
import { loadStatementInputs } from '../statements/load';
import { readBaseline, type BaselineValue } from './baseline';
import { balancesFromParsed, compareToBaseline, type Difference } from './compare';
import { KNOWN_DATABOOK_ERRORS, knownErrorKey } from './known-errors';
import { checkOpenings, type OpeningDifference } from './openings';
import { parseDatabook, type ParsedDatabook } from './parse';

export const DATABOOK_ENTITIES = ['MLB', 'MLF', 'MLL', 'GSA', 'LSA', 'ELIM'];

export type ClassifiedDifference = Difference & { knownWhy: string | null };
export type Comparison = { compared: number; differences: ClassifiedDifference[]; unexplained: number };
export type BsBreak = { period: string; entity: string; diff: Decimal };

export type DatabookCheck = {
  through: string;
  parsed: ParsedDatabook;
  errors: number;
  warnings: number;
  openings: OpeningDifference[];
  bsBreaks: BsBreak[];
  comparison: Comparison;
};

function classify(compared: number, differences: Difference[]): Comparison {
  const known = new Map(KNOWN_DATABOOK_ERRORS.map(k => [knownErrorKey(k), k.why]));
  const out = differences.map(d => ({ ...d, knownWhy: known.get(knownErrorKey({ ...d, diff: cents(d.diff) })) ?? null }));
  return { compared, differences: out, unexplained: out.filter(d => !d.knownWhy).length };
}

/** The last month that carries figures: future months in the Databook are formulas that evaluate to zero. */
export function latestPeriodWithData(wb: Workbook): string | null {
  const all = parseDatabook(wb, { through: '9999-12' });
  const withData = all.periods.filter(p => all.entities.some(e => e.entity !== 'ELIM' && e.accounts.some(a => !a.balances.get(p)?.isZero())));
  return withData.at(-1) ?? null;
}

export function checkDatabook(wb: Workbook, through: string): DatabookCheck {
  const parsed = parseDatabook(wb, { through });
  const errors = parsed.issues.filter(i => i.severity === 'ERROR').length;
  const bsBreaks: BsBreak[] = [];
  for (const p of parsed.periods) {
    const st = computeStatements(balancesFromParsed(parsed, p), DATABOOK_ENTITIES);
    for (const e of [...DATABOOK_ENTITIES, CONSOLIDATED]) {
      const d = st.checks.bsDifference.get(e)!;
      if (d.abs().gte('0.005')) bsBreaks.push({ period: p, entity: e, diff: d });
    }
  }
  const baseline = readBaseline(wb).filter(b => b.period <= through);
  const { compared, differences } = errors ? { compared: 0, differences: [] } :
    compareToBaseline(baseline, p => balancesFromParsed(parsed, p), DATABOOK_ENTITIES);
  return {
    through, parsed, errors, warnings: parsed.issues.length - errors,
    openings: checkOpenings(parsed), bsBreaks, comparison: classify(compared, differences),
  };
}

export type DbVerification = Comparison & { periods: number; notLoaded: string[]; gaps: string[] };

/** After import: statements read back from the database against the same Databook figures. */
export async function verifyAgainstDb(db: PrismaClient, wb: Workbook, through: string): Promise<DbVerification> {
  const all: BaselineValue[] = readBaseline(wb).filter(b => b.period <= through);
  const cache = new Map<string, MappedBalance[]>();
  const notLoaded: string[] = [];
  const gaps: string[] = [];
  for (const period of [...new Set(all.map(b => b.period))].sort()) {
    const inputs = await loadStatementInputs(db, { periodKey: period, entityCodes: DATABOOK_ENTITIES, basis: 'LATEST' });
    const missing = inputs.entities.filter(e => !e.submission).map(e => e.entity);
    // A period nothing was loaded for is not evidence either way.
    if (missing.length === DATABOOK_ENTITIES.length) { notLoaded.push(period); continue; }
    cache.set(period, inputs.balances);
    const unmapped = inputs.entities.reduce((n, e) => n + e.unmappedAccounts.length, 0);
    if (missing.length || unmapped) gaps.push(`${period}: missing ${missing.join(', ') || '-'}; unmapped ${unmapped}`);
  }
  const { compared, differences } = compareToBaseline(all.filter(b => cache.has(b.period)), p => cache.get(p)!, DATABOOK_ENTITIES);
  return { ...classify(compared, differences), periods: cache.size, notLoaded, gaps };
}
