// Compare the engine's statements with the Databook baseline. Used by the acceptance test and the verify script.

import { Decimal, amount } from '../money';
import { computeStatements, type MappedBalance } from '../statements/engine';
import type { BaselineValue } from './baseline';
import type { ParsedDatabook } from './parse';

export type Difference = BaselineValue & { portal: Decimal; diff: Decimal };

/** Balances for one period straight from the parsed Databook (the database load produces the same shape). */
export function balancesFromParsed(parsed: ParsedDatabook, period: string): MappedBalance[] {
  return parsed.entities.flatMap(e => e.accounts.map(a => ({
    entity: e.entity, lineCode: a.lineCode, balance: a.balances.get(period) ?? 0,
  })));
}

/**
 * Every baseline value against the engine. Tolerance is half a cent: the Databook's $000s columns
 * are exact divisions of the same cell values, so any real difference shows.
 */
export function compareToBaseline(
  baseline: readonly BaselineValue[],
  balancesFor: (period: string) => MappedBalance[],
  entities: readonly string[],
  tolerance: Decimal.Value = '0.005',
): { compared: number; differences: Difference[] } {
  const tol = amount(tolerance);
  const byPeriod = new Map<string, ReturnType<typeof computeStatements>>();
  const differences: Difference[] = [];
  for (const b of baseline) {
    let st = byPeriod.get(b.period);
    if (!st) { st = computeStatements(balancesFor(b.period), entities); byPeriod.set(b.period, st); }
    const portal = st.amounts.get(b.lineCode)?.get(b.entity) ?? amount(0);
    const diff = portal.minus(b.value);
    if (diff.abs().gt(tol)) differences.push({ ...b, portal, diff });
  }
  return { compared: baseline.length, differences };
}
