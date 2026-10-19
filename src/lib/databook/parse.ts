// Databook parser: "MLF Group Trial Balances 2026 (Databook Post Audit).xlsx" → accounts and monthly balances.
// Pure (takes an ExcelJS workbook), so the same code feeds the database load and the regression tests.
//
// Layout (handoff §3, verified 2026-10-19): one tab per entity, headers on row 6, accounts from row 7.
// Monthly columns are cumulative period-end balances, signed debit − credit. The Elim tab adds a "Ref" column,
// and its "IC" column names the counterparty entity instead of flagging "IC".

import type { Cell, Workbook, Worksheet } from 'exceljs';
import type { Statement } from '@prisma/client';
import { Decimal, amount } from '../money';
import { ENTITIES } from '../reference';
import { lineForL1, normalizeLabel } from '../statements/layout';

export const DATABOOK_TABS: Record<string, string> = { MLB: 'MLB', MLF: 'MLF', MLL: 'MLL', GSA: 'GSA', LSA: 'LSA', ELIM: 'Elim' };
const HEADER_ROW = 6;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export type Issue = {
  severity: 'ERROR' | 'WARNING';
  code: string;
  tab: string;
  row?: number;
  message: string;
};

export type ParsedAccount = {
  code: string;
  nameSource: string;
  nameEn: string | null;
  statement: Statement;
  bsType: string | null;
  accountType: string | null;
  isIntercompany: boolean;
  /** Entity code of the counterparty, when the Databook names one (Elim tab). */
  icCounterparty: string | null;
  l1: string;
  l2: string;
  l3: string | null;
  /** DETAIL statement line code the L1 feeds. */
  lineCode: string;
  eliminationRefs: string[];
  rows: number[];
  /** periodKey ("2026-09") → cumulative balance. */
  balances: Map<string, Decimal>;
  /** Fiscal year ("2025") → the Databook's opening balance (BB, BB2), after closing the PL into retained earnings. */
  openings: Map<string, Decimal>;
};

/** "BB" opens 2025, "BB2" opens 2026. */
export function openingYearForHeader(header: string): string | null {
  const h = header.toLowerCase().replace(/\s/g, '');
  return h === 'bb' ? '2025' : h === 'bb2' ? '2026' : null;
}

export type ParsedEntity = { entity: string; tab: string; accounts: ParsedAccount[] };
export type ParsedDatabook = { periods: string[]; entities: ParsedEntity[]; issues: Issue[] };

/**
 * Header → period key. "Dec '24" / "Dec24" = 2024-12; "Jan".."Dec" = 2025; "Jan-26".."Dec-26" = 2026.
 * Crowe, BB and BB2 are openings and audit figures, not periods.
 */
export function periodForHeader(header: string): string | null {
  const h = header.toLowerCase().replace(/['’\s]/g, '');
  if (h === 'dec24') return '2024-12';
  const m25 = MONTHS.indexOf(h);
  if (m25 >= 0) return `2025-${String(m25 + 1).padStart(2, '0')}`;
  const m = /^([a-z]{3})-?26$/.exec(h);
  if (m && MONTHS.includes(m[1]!)) return `2026-${String(MONTHS.indexOf(m[1]!) + 1).padStart(2, '0')}`;
  return null;
}

type CellNumber = { value: Decimal } | { error: string };

/** A balance cell. Formulas read Excel's cached result; Excel omits the cache for a zero result. */
export function readNumber(cell: Cell): CellNumber {
  const v = cell.value as unknown;
  if (v === null || v === undefined || v === '') return { value: amount(0) };
  if (typeof v === 'number') return { value: amount(v) };
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '' || t === '-') return { value: amount(0) };
    try { return { value: amount(t.replace(/,/g, '')) }; } catch { return { error: `text "${t}"` }; }
  }
  if (typeof v === 'object') {
    const o = v as { formula?: string; sharedFormula?: string; result?: unknown; error?: string };
    if (o.error) return { error: o.error };
    if ('formula' in o || 'sharedFormula' in o) {
      const r = o.result;
      if (r === undefined || r === null || r === '') return { value: amount(0) };
      if (typeof r === 'number') return { value: amount(r) };
      if (typeof r === 'object' && r && 'error' in r) return { error: String((r as { error: string }).error) };
      return { error: `formula result ${JSON.stringify(r)}` };
    }
  }
  return { error: `unreadable ${JSON.stringify(v).slice(0, 60)}` };
}

const text = (cell: Cell): string | null => {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; result?: unknown };
    if (o.richText) return o.richText.map(r => r.text).join('').trim() || null;
    if ('result' in o) return o.result === null || o.result === undefined ? null : String(o.result).trim() || null;
  }
  const s = String(v).trim();
  return s === '' ? null : s;
};

const entityByDatabookName = new Map(ENTITIES.map(e => [normalizeLabel(e.databookName), e.code]));

/** Parse every entity tab for the periods up to and including `through` (e.g. "2026-09"). */
export function parseDatabook(wb: Workbook, opts: { through: string }): ParsedDatabook {
  const issues: Issue[] = [];
  const entities: ParsedEntity[] = [];
  let periods: string[] = [];

  for (const [entity, tab] of Object.entries(DATABOOK_TABS)) {
    const ws = wb.getWorksheet(tab);
    if (!ws) { issues.push({ severity: 'ERROR', code: 'TAB_MISSING', tab, message: `Tab "${tab}" not found` }); continue; }
    const parsed = parseTab(ws, entity, tab, opts.through, issues);
    if (!parsed) continue;
    if (!periods.length) periods = parsed.periods;
    else if (parsed.periods.join() !== periods.join())
      issues.push({ severity: 'ERROR', code: 'PERIODS_DIFFER', tab, message: `Period columns differ from the first tab` });
    entities.push({ entity, tab, accounts: parsed.accounts });
  }
  return { periods, entities, issues };
}

function parseTab(ws: Worksheet, entity: string, tab: string, through: string, issues: Issue[]) {
  const header = ws.getRow(HEADER_ROW);
  const cols = new Map<string, number>();
  const periodCols: { key: string; col: number }[] = [];
  const openingCols: { year: string; col: number }[] = [];
  header.eachCell((cell, col) => {
    const h = text(cell);
    if (!h) return;
    cols.set(normalizeLabel(h), col);
    const p = periodForHeader(h);
    if (p && p <= through) periodCols.push({ key: p, col });
    const y = openingYearForHeader(h);
    if (y && `${y}-01` <= through) openingCols.push({ year: y, col });
  });

  const need = ['cuenta', 'nombre', 'entity', 'pl/bs', 'l1', 'l2'];
  const missing = need.filter(n => !cols.has(n));
  if (missing.length) {
    issues.push({ severity: 'ERROR', code: 'HEADER_MISSING', tab, row: HEADER_ROW, message: `Missing columns: ${missing.join(', ')}` });
    return null;
  }
  const at = (row: number, name: string) => {
    const c = cols.get(name);
    return c ? ws.getRow(row).getCell(c) : null;
  };
  const isElim = entity === 'ELIM';
  const byCode = new Map<string, ParsedAccount>();
  const syntheticCodes = new Set<string>();

  for (let r = HEADER_ROW + 1; r <= ws.rowCount; r++) {
    let code = text(at(r, 'cuenta')!);
    const entityName = text(at(r, 'entity')!);
    const l1 = text(at(r, 'l1')!);
    const pb = text(at(r, 'pl/bs')!);

    // Totals and check rows below the table: no entity, PL/BS or L1. Excel's SUMIF skips them, and so do we.
    if (!entityName && !l1 && !pb) {
      if (code) issues.push({ severity: 'WARNING', code: 'NOT_AN_ACCOUNT_ROW', tab, row: r, message: `Skipped "${code}": no entity, PL/BS or L1` });
      continue;
    }

    // Lines without an account number are real balances (MLB's whole ledger, US GAAP lease and audit adjustments).
    // They get a portal code from their name, flagged so the Controller can assign the source number.
    if (!code) {
      const name = text(at(r, 'nombre')!) ?? text(at(r, 'tb account name english')!) ?? `row ${r}`;
      const base = `~${name.replace(/\s+/g, ' ').trim().slice(0, 60)}`;
      code = base;
      for (let n = 2; syntheticCodes.has(code) || (!isElim && byCode.has(code)); n++) code = `${base} #${n}`;
      syntheticCodes.add(code);
      issues.push({ severity: 'WARNING', code: 'NO_ACCOUNT_CODE', tab, row: r, message: `Line "${name}" has no account number; portal code "${code}"` });
    }
    const rowEntity = entityName ? entityByDatabookName.get(normalizeLabel(entityName)) : undefined;
    if (rowEntity !== entity) {
      issues.push({ severity: 'ERROR', code: 'WRONG_ENTITY', tab, row: r,
        message: `Account ${code}: Entity "${entityName ?? ''}" is not ${entity}` });
      continue;
    }
    const statement = pb === 'BS' || pb === 'PL' ? pb : null;
    if (!statement) {
      issues.push({ severity: 'ERROR', code: 'BAD_PL_BS', tab, row: r, message: `Account ${code}: PL/BS is "${pb ?? ''}"` });
      continue;
    }
    const balances = new Map<string, Decimal>();
    let bad = false;
    for (const p of periodCols) {
      const n = readNumber(ws.getRow(r).getCell(p.col));
      if ('error' in n) {
        issues.push({ severity: 'ERROR', code: 'BAD_AMOUNT', tab, row: r, message: `Account ${code}, ${p.key}: ${n.error}` });
        bad = true;
      } else balances.set(p.key, n.value);
    }
    const openings = new Map<string, Decimal>();
    for (const o of openingCols) {
      const n = readNumber(ws.getRow(r).getCell(o.col));
      if ('error' in n) {
        issues.push({ severity: 'ERROR', code: 'BAD_AMOUNT', tab, row: r, message: `Account ${code}, opening ${o.year}: ${n.error}` });
        bad = true;
      } else openings.set(o.year, n.value);
    }
    if (bad) continue;

    const line = l1 ? lineForL1(statement, l1) : undefined;
    if (!l1 || !line) {
      // The Databook's SUMIF finds nothing for an L1 that isn't a detail line, so the balance drops out of its statements.
      // Harmless at zero; anything else would silently unbalance them.
      const allZero = [...balances.values()].every(v => v.isZero());
      issues.push({ severity: allZero ? 'WARNING' : 'ERROR', code: 'UNKNOWN_L1', tab, row: r,
        message: `Account ${code}: L1 "${l1 ?? ''}" is not a ${statement} detail line${allZero ? ' (all zero, excluded)' : ''}` });
      continue;
    }

    const icRaw = text(at(r, 'ic')!);
    const ref = isElim ? text(at(r, 'ref')!) : null;
    const l2 = text(at(r, 'l2')!) ?? l1;
    const existing = byCode.get(code);

    if (existing) {
      // The Elim tab can repeat an account across reference letters; those lines add up into one ELIM balance.
      if (!isElim) {
        issues.push({ severity: 'ERROR', code: 'DUPLICATE_ACCOUNT', tab, row: r, message: `Account ${code} repeats row ${existing.rows[0]}` });
        continue;
      }
      if (existing.lineCode !== line.code) {
        issues.push({ severity: 'ERROR', code: 'CONFLICTING_L1', tab, row: r,
          message: `Account ${code}: L1 "${l1}" here, "${existing.l1}" on row ${existing.rows[0]}` });
        continue;
      }
      for (const [k, v] of balances) existing.balances.set(k, existing.balances.get(k)!.plus(v));
      for (const [k, v] of openings) existing.openings.set(k, existing.openings.get(k)!.plus(v));
      existing.rows.push(r);
      if (ref && !existing.eliminationRefs.includes(ref)) existing.eliminationRefs.push(ref);
      continue;
    }

    byCode.set(code, {
      code,
      nameSource: text(at(r, 'nombre')!) ?? code,
      nameEn: text(at(r, 'tb account name english')!),
      statement,
      bsType: text(at(r, 'bs type')!),
      accountType: text(at(r, 'account type')!),
      isIntercompany: isElim || normalizeLabel(icRaw ?? '') === 'ic',
      icCounterparty: isElim && icRaw ? entityByDatabookName.get(normalizeLabel(icRaw)) ?? null : null,
      l1, l2, l3: text(at(r, 'l3')!),
      lineCode: line.code,
      eliminationRefs: ref ? [ref] : [],
      rows: [r],
      balances,
      openings,
    });
  }

  periodCols.sort((a, b) => a.key.localeCompare(b.key));
  return { periods: periodCols.map(p => p.key), accounts: [...byCode.values()] };
}
