// Statement engine: mapped balances in, BS and PL per entity and consolidated out. Pure; no database.
// One implementation for every screen, export and test (master prompt §24: no duplicated calculation logic).

import { Decimal, ZERO, sum } from '../money';
import { ALL_LINES, type LineDef } from './layout';

/** One mapped balance: an entity's cumulative period-end balance on a DETAIL line, signed debit − credit. */
export type MappedBalance = { entity: string; lineCode: string; balance: Decimal.Value };

export type StatementResult = {
  entities: string[];
  /** lineCode → entity → amount. Consolidated is under CONSOLIDATED. */
  amounts: Map<string, Map<string, Decimal>>;
  checks: {
    /** Per entity: total assets + total liabilities & equity, which is 0 when the BS balances (signed). */
    bsDifference: Map<string, Decimal>;
    /** Per entity: sum of every mapped balance, which is 0 when the TB balances. */
    tbDifference: Map<string, Decimal>;
  };
};

export const CONSOLIDATED = 'CONSOLIDATED';

export function computeStatements(
  balances: readonly MappedBalance[],
  entities: readonly string[],
  lines: readonly LineDef[] = ALL_LINES,
): StatementResult {
  const known = new Set(lines.map(l => l.code));
  const detail = new Map<string, Map<string, Decimal>>();
  const tb = new Map<string, Decimal>(entities.map(e => [e, ZERO]));

  for (const b of balances) {
    if (!entities.includes(b.entity)) continue;
    const line = lines.find(l => l.code === b.lineCode);
    if (!line || !known.has(b.lineCode)) throw new Error(`Unknown statement line ${b.lineCode}`);
    if (line.kind !== 'DETAIL' || line.computed) throw new Error(`Balances cannot post to ${b.lineCode}`);
    const row = detail.get(b.lineCode) ?? new Map<string, Decimal>();
    row.set(b.entity, (row.get(b.entity) ?? ZERO).plus(b.balance));
    detail.set(b.lineCode, row);
    tb.set(b.entity, tb.get(b.entity)!.plus(b.balance));
  }

  const amounts = new Map<string, Map<string, Decimal>>();
  const get = (code: string, entity: string) => amounts.get(code)?.get(entity) ?? ZERO;

  // PL first: the BS net income line reads the PL result.
  const ordered = [...lines.filter(l => l.statement === 'PL'), ...lines.filter(l => l.statement === 'BS')];
  for (const line of ordered) {
    const row = new Map<string, Decimal>();
    for (const e of entities) {
      let v: Decimal;
      if (line.kind === 'SUBTOTAL')
        v = sum((line.sumOf ?? []).map(c => (c.startsWith('-') ? get(c.slice(1), e).negated() : get(c, e))));
      else if (line.computed === 'PL_NET_INCOME') v = get('PL.NET_INCOME', e);
      else v = detail.get(line.code)?.get(e) ?? ZERO;
      row.set(e, v);
    }
    row.set(CONSOLIDATED, sum(entities.map(e => row.get(e)!)));
    amounts.set(line.code, row);
  }

  const bsDifference = new Map<string, Decimal>();
  for (const e of [...entities, CONSOLIDATED])
    bsDifference.set(e, get('BS.TOTAL_ASSETS', e).plus(get('BS.TOTAL_LIABILITIES_EQUITY', e)));
  tb.set(CONSOLIDATED, sum(entities.map(e => tb.get(e)!)));

  return { entities: [...entities], amounts, checks: { bsDifference, tbDifference: tb } };
}
