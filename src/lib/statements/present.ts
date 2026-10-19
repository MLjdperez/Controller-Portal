// Presentation rules: pure, so screens and exports show the same figures.
// Storage and the engine stay signed debit − credit. Presentation shows natural signs:
// assets and expenses as debits, liabilities, equity and income as credits, each positive when "normal".

import { Decimal, ZERO } from '../money';
import { BS_LINES, PL_LINES, ALL_LINES, type LineDef } from './layout';

export type SignMode = 'natural' | 'raw';

const firstCreditBsIndex = BS_LINES.findIndex(l => l.code === 'BS.AP');
const CREDIT_NORMAL = new Set([
  ...BS_LINES.slice(firstCreditBsIndex).map(l => l.code),
  // PL: income is credit-normal. Showing the whole PL from the income side makes revenue and
  // profit positive and costs negative, which reads top to bottom: revenue − costs = profit.
  ...PL_LINES.map(l => l.code),
]);

/** Multiplier from stored (debit − credit) to displayed value. */
export function displaySign(lineCode: string, mode: SignMode): 1 | -1 {
  return mode === 'natural' && CREDIT_NORMAL.has(lineCode) ? -1 : 1;
}

export function present(lineCode: string, v: Decimal, mode: SignMode): Decimal {
  return v.times(displaySign(lineCode, mode));
}

/**
 * PL month activity from YTD balances: this month's YTD minus last month's, except in January
 * (and when the prior period isn't loaded, which the caller must label).
 */
export function monthFromYtd(current: Decimal, prior: Decimal | null, isFirstMonth: boolean): Decimal {
  if (isFirstMonth) return current;
  return current.minus(prior ?? ZERO);
}

/** The lines a subtotal is built from, expanded to DETAIL lines (for drill-down). */
export function detailLinesOf(code: string, lines: readonly LineDef[] = ALL_LINES): string[] {
  const line = lines.find(l => l.code === code);
  if (!line) return [];
  if (line.kind === 'DETAIL') return line.computed === 'PL_NET_INCOME' ? detailLinesOf('PL.NET_INCOME', lines) : [code];
  return (line.sumOf ?? []).flatMap(c => detailLinesOf(c, lines));
}

export function previousPeriodKey(key: string): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
