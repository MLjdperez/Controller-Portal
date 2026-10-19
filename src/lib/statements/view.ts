// The statement as displayed: one builder for the screen and the Excel download, so they can't disagree.
import type { Locale } from '@prisma/client';
import { Decimal, ZERO } from '../money';
import { BS_LINES, EBITDA_DEFINITION, PL_LINES, ALL_LINES } from './layout';
import { monthFromYtd, present, type SignMode } from './present';
import type { StatementResult } from './engine';
import { ENTITIES } from '../reference';

const CONSOLIDATION_ONLY = new Set(ENTITIES.filter(e => e.kind === 'CONSOLIDATION').map(e => e.code));

export type RowKind = 'DETAIL' | 'SUBTOTAL' | 'MEMO_HEADER' | 'MEMO' | 'MEMO_TOTAL' | 'RATIO' | 'CHECK';

export type ViewRow = {
  key: string;
  /** Statement line the figures drill into, if any. */
  lineCode: string | null;
  label: string;
  kind: RowKind;
  /** One per column. Ratios are fractions (0.05 = 5%); null means not computable (e.g. zero revenue). */
  values: (Decimal | null)[];
};

export type ViewArgs = {
  stmt: 'BS' | 'PL';
  monthView: boolean;
  signs: SignMode;
  locale: Locale;
  columns: string[];
  result: StatementResult;
  prior: StatementResult | null;
  isFirstMonth: boolean;
};

const labelOf = (code: string, locale: Locale) => {
  const l = ALL_LINES.find(x => x.code === code)!;
  return locale === 'es' ? l.nameEs : l.nameEn;
};

export function buildView(a: ViewArgs): ViewRow[] {
  const raw = (code: string, col: string) => {
    const ytd = a.result.amounts.get(code)?.get(col) ?? ZERO;
    return a.monthView ? monthFromYtd(ytd, a.prior?.amounts.get(code)?.get(col) ?? null, a.isFirstMonth) : ytd;
  };
  const shown = (code: string) => a.columns.map(c => present(code, raw(code, c), a.signs));

  const lines = a.stmt === 'BS' ? BS_LINES : PL_LINES;
  const rows: ViewRow[] = lines.map(l => ({
    key: l.code, lineCode: l.code, label: labelOf(l.code, a.locale), kind: l.kind, values: shown(l.code),
  }));

  if (a.stmt === 'BS') {
    rows.push({
      key: 'BS.CHECK', lineCode: null, kind: 'CHECK',
      label: a.locale === 'es' ? 'Descuadre (activos + pasivos y patrimonio)' : 'Out of balance (assets + liabilities & equity)',
      values: a.columns.map(c => a.result.checks.bsDifference.get(c) ?? ZERO),
    });
    return rows;
  }

  // EBITDA reconciliation (non-GAAP memo). Add-backs are shown so the column adds up in either sign mode:
  // EBITDA = net income − add-backs (stored signs), i.e. net income + add-backs as displayed with natural signs.
  const e = EBITDA_DEFINITION;
  rows.push({ key: 'EBITDA.HEADER', lineCode: null, kind: 'MEMO_HEADER', values: a.columns.map(() => null),
    label: a.locale === 'es' ? 'Conciliación a EBITDA (no GAAP)' : 'Reconciliation to EBITDA (non-GAAP)' });
  rows.push({ key: 'EBITDA.BASE', lineCode: e.base, kind: 'MEMO', label: labelOf(e.base, a.locale), values: shown(e.base) });
  for (const code of e.addBacks)
    rows.push({ key: `EBITDA.ADD.${code}`, lineCode: code, kind: 'MEMO', label: `+ ${labelOf(code, a.locale)}`,
      values: shown(code).map(v => v.negated()) });
  rows.push({ key: e.code, lineCode: e.code, kind: 'MEMO_TOTAL', label: labelOf(e.code, a.locale), values: shown(e.code) });
  rows.push({
    key: 'EBITDA.MARGIN', lineCode: null, kind: 'RATIO',
    label: a.locale === 'es' ? 'Margen EBITDA (% de ingresos netos)' : 'EBITDA margin (% of net revenue)',
    // Same sign treatment top and bottom, so the ratio is sign-mode independent.
    values: a.columns.map(c => {
      // A margin of the eliminations column means nothing (it's revenue and cost removed, not a business).
      if (CONSOLIDATION_ONLY.has(c)) return null;
      const rev = raw(e.revenue, c);
      return rev.isZero() ? null : raw(e.code, c).div(rev);
    }),
  });
  return rows;
}
