// The Databook's own statements, read from Excel's cached values, as the regression baseline.
//
// - "BS" / "PL" tabs: one entity (selector in B5, "Mama Lycha" = MLF), every month, raw signed dollars.
// - "BS (YE)" / "PL (YE)": every entity side by side for Dec-2025 (column Z of each entity tab), in $000s.
//   PL (YE) flips the sign, except its MLB column, which is neither flipped nor scaled. So each column's
//   factor is read from its own SUMIF formula, never assumed.

import type { Cell, Workbook, Worksheet } from 'exceljs';
import type { Statement } from '@prisma/client';
import { Decimal, amount } from '../money';
import { ENTITIES } from '../reference';
import { ALL_LINES, normalizeLabel } from '../statements/layout';
import { readNumber } from './parse';

export type BaselineValue = {
  source: string;
  entity: string;
  period: string;
  lineCode: string;
  /** Converted to raw signed dollars (debit − credit). */
  value: Decimal;
};

const lineByName = new Map(ALL_LINES.map(l => [`${l.statement}:${normalizeLabel(l.nameEn)}`, l.code]));
const lineCode = (statement: Statement, name: string) => lineByName.get(`${statement}:${normalizeLabel(name)}`);

const formulaOf = (cell: Cell): string | null => {
  const v = cell.value as { formula?: string } | null;
  return v && typeof v === 'object' && typeof v.formula === 'string' ? v.formula : null;
};

/** Multiplier that turns a displayed value back into raw dollars, from a SUMIF/SUMIFS formula's shape. */
export function factorFromFormula(formula: string): Decimal {
  const f = formula.replace(/\s/g, '');
  const sign = f.startsWith('-') ? -1 : 1;
  const scaled = /\/1000\b/.test(f);
  return amount(sign).times(scaled ? 1000 : 1);
}

const isSumIf = (f: string | null) => !!f && /SUMIFS?\(/i.test(f);

/**
 * Detail lines and subtotals for one column, in raw dollars.
 * Detail cells carry their own factor (PL (YE) flips revenue rows but not cost rows).
 * Subtotals are SUMs of displayed values, so their sign follows the tab's presentation: PL (YE) shows
 * income as positive (subtotal = −raw); every other tab shows raw signs. Scale follows the column's detail cells.
 */
/** PL (YE) flips revenue rows only, so its income subtotals display flipped while cost subtotals stay raw. */
const PL_YE_FLIPPED = new Set(['PL.NET_REVENUE', 'PL.GROSS_PROFIT', 'PL.OPERATING_PROFIT', 'PL.NET_INCOME']);

function readColumn(ws: Worksheet, statement: Statement, col: number, firstRow: number, lastRow: number, flipIncome: boolean) {
  let scale: Decimal | null = null;
  const out = new Map<string, Decimal>();
  const subtotals: [string, Decimal][] = [];
  for (let r = firstRow; r <= lastRow; r++) {
    const name = ws.getRow(r).getCell(2).value;
    if (typeof name !== 'string') continue;
    const code = lineCode(statement, name);
    if (!code) continue; // ratios, checks and memo rows
    const cell = ws.getRow(r).getCell(col);
    const n = readNumber(cell);
    if ('error' in n) continue;
    const f = formulaOf(cell);
    if (isSumIf(f)) {
      const factor = factorFromFormula(f!);
      scale ??= factor.abs();
      out.set(code, n.value.times(factor));
    } else if (ALL_LINES.find(l => l.code === code)?.kind === 'SUBTOTAL') {
      subtotals.push([code, n.value]);
    } else if (code === 'BS.NET_INCOME') {
      subtotals.push([code, n.value]); // =-'PL (YE)'!x49 or =+PL!x50: displayed like a BS subtotal
    }
  }
  if (!scale) return new Map<string, Decimal>();
  for (const [code, v] of subtotals) out.set(code, v.times(scale).times(flipIncome && PL_YE_FLIPPED.has(code) ? -1 : 1));
  return out;
}

const monthKey = (v: unknown): string | null => {
  const d = v instanceof Date ? v : null;
  return d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` : null;
};

export function readBaseline(wb: Workbook): BaselineValue[] {
  const out: BaselineValue[] = [];
  const entityByName = new Map(ENTITIES.map(e => [normalizeLabel(e.databookName), e.code]));

  // Monthly tabs: the selected entity, every month.
  for (const [tab, statement] of [['BS', 'BS'], ['PL', 'PL']] as const) {
    const ws = wb.getWorksheet(tab);
    if (!ws) continue;
    const selected = ws.getCell('B5').value;
    const entity = typeof selected === 'string' ? entityByName.get(normalizeLabel(selected)) : undefined;
    if (!entity) continue;
    ws.getRow(8).eachCell((cell, col) => {
      const v = cell.value as unknown;
      const period = monthKey(v && typeof v === 'object' && 'result' in (v as object) ? (v as { result: unknown }).result : v);
      // The BS tab's Dec-24 column reads the BB (2025 opening, post-closing) column, not Dec '24.
      // That is an opening balance, checked by checkOpenings(), not a period-end statement.
      if (!period || period === '2024-12') return;
      for (const [code, value] of readColumn(ws, statement, col, 9, 50, false))
        out.push({ source: tab, entity, period, lineCode: code, value });
    });
  }

  // Year-end tabs: every entity, Dec-2025.
  const yeCols: Record<string, string> = { MLB: 'MLB', MLF: 'MLF', MLL: 'MLL', GSA: 'GSA', LSA: 'LSA', EJE: 'ELIM' };
  for (const [tab, statement] of [['BS (YE)', 'BS'], ['PL (YE)', 'PL']] as const) {
    const ws = wb.getWorksheet(tab);
    if (!ws) continue;
    ws.getRow(8).eachCell((cell, col) => {
      if (col > 10) return; // the second block is the Crowe (Dec-24 audited) comparison
      const entity = typeof cell.value === 'string' ? yeCols[cell.value.trim()] : undefined;
      if (!entity) return;
      for (const [code, value] of readColumn(ws, statement, col, 9, 50, statement === 'PL'))
        out.push({ source: tab, entity, period: '2025-12', lineCode: code, value });
    });
  }
  return out;
}
