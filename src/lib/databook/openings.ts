// Roll-forward control: each year's opening (BB, BB2) must equal the prior December, with the PL closed
// into retained earnings. A difference means the opening was keyed or adjusted separately and needs an explanation.

import { Decimal, ZERO } from '../money';
import type { ParsedDatabook } from './parse';

export type OpeningDifference = {
  entity: string;
  year: string;
  lineCode: string;
  /** Prior December rolled forward. */
  expected: Decimal;
  /** The Databook's opening column. */
  actual: Decimal;
  diff: Decimal;
};

const RETAINED_EARNINGS = 'BS.RETAINED_EARNINGS';

export function checkOpenings(parsed: ParsedDatabook, tolerance = '0.005'): OpeningDifference[] {
  const out: OpeningDifference[] = [];
  for (const e of parsed.entities) {
    const years = new Set(e.accounts.flatMap(a => [...a.openings.keys()]));
    for (const year of years) {
      const priorDec = `${Number(year) - 1}-12`;
      if (!parsed.periods.includes(priorDec)) continue;
      const expected = new Map<string, Decimal>();
      const actual = new Map<string, Decimal>();
      const add = (m: Map<string, Decimal>, k: string, v: Decimal) => m.set(k, (m.get(k) ?? ZERO).plus(v));
      for (const a of e.accounts) {
        const prior = a.balances.get(priorDec) ?? ZERO;
        // BS carries forward; the year's PL result closes into retained earnings; PL opens at zero.
        if (a.statement === 'BS') add(expected, a.lineCode, prior);
        else { add(expected, RETAINED_EARNINGS, prior); add(expected, a.lineCode, ZERO); }
        add(actual, a.lineCode, a.openings.get(year) ?? ZERO);
      }
      for (const code of new Set([...expected.keys(), ...actual.keys()])) {
        const x = expected.get(code) ?? ZERO, y = actual.get(code) ?? ZERO;
        const diff = y.minus(x);
        if (diff.abs().gt(tolerance)) out.push({ entity: e.entity, year, lineCode: code, expected: x, actual: y, diff });
      }
    }
  }
  return out;
}
