// Trial balance file parser: a sheet of cells in, account balances out. Pure, so it is tested without files or a database.
//
// Built from the subsidiaries' real files (Lunic "Balanza de Comprobación", 2026-10-19):
// - Headers are found by name (English or Spanish), not position; title rows above them are skipped.
// - Charts are hierarchical: group rows (1, 11, 1101, 110101) carry the sum of the accounts under them. Only the
//   lowest-level accounts are kept, and a group is dropped only when it equals the sum of its accounts.
// - A single balance column may be signed (debit +) or "natural" (every class positive). Both are tried; the one that
//   balances is used. Natural: classes 1, 5, 6, 7, 8, 9 are debit-normal; 2, 3, 4 credit-normal.
// - A non-USD file needs a USD column (the translation engine is Phase 2); both amounts are kept.

import { Decimal, ZERO, amount } from '../money';

export type Cell = string | number | null | undefined;
export type Issue = { severity: 'ERROR' | 'WARNING'; code: string; row?: number; message: string };
export type SignMode = 'DEBIT_CREDIT' | 'SIGNED' | 'NATURAL_BY_CLASS';

export type TbLineParsed = {
  row: number;
  code: string;
  name: string;
  /** Signed debit − credit, in the file's (functional) currency. */
  balance: Decimal;
  /** Signed, in USD. Equals balance for USD files. */
  reporting: Decimal;
};

export type TbParse = {
  headerRow: number | null;
  columns: Partial<Record<'code' | 'name' | 'balance' | 'debit' | 'credit' | 'usd', number>>;
  signMode: SignMode | null;
  groupRowsSkipped: number;
  lines: TbLineParsed[];
  totals: { balance: Decimal; reporting: Decimal };
  issues: Issue[];
};

const norm = (v: Cell) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const HEADERS: Record<keyof TbParse['columns'], RegExp> = {
  code: /^(n[ºo°.]? ?(de )?cuenta|cuenta|codigo|codigo cuenta|account|account (no|number|code)|acct|gl account|no\.? cuenta)$/,
  name: /^(nombre( cuenta)?|nombre de (la )?cuenta|descripcion|description|account name|name)$/,
  balance: /^(balance final|saldo final|saldo|ending balance|closing balance|balance)$/,
  debit: /^(debit|debito|debe|cargos?|dr)$/,
  credit: /^(credit|credito|haber|abonos?|cr)$/,
  usd: /^(usd|us\$|dolares|saldo usd|balance usd)$/,
};

const CREDIT_CLASSES = new Set(['2', '3', '4']);
const TOLERANCE = new Decimal('0.005');

/** A cell as an amount: numbers, "1,234.50", "(1,234.50)" negative, "-" or blank zero. Null when it isn't a number. */
export function toAmount(v: Cell): Decimal | null {
  if (v === null || v === undefined || v === '') return ZERO;
  if (typeof v === 'number') return Number.isFinite(v) ? amount(v) : null;
  let s = String(v).trim().replace(/[$\s]/g, '');
  if (s === '' || s === '-' || s === '–') return ZERO;
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/^\(|\)$/g, '').replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const d = amount(s);
  return neg ? d.negated() : d;
}

const codeText = (v: Cell) => (typeof v === 'number' ? String(Math.trunc(v)) : String(v ?? '').trim());

function findHeader(grid: Cell[][]) {
  for (let r = 0; r < Math.min(grid.length, 40); r++) {
    const cols: TbParse['columns'] = {};
    (grid[r] ?? []).forEach((cell, c) => {
      const n = norm(cell);
      for (const [role, re] of Object.entries(HEADERS) as [keyof TbParse['columns'], RegExp][])
        if (cols[role] === undefined && re.test(n)) cols[role] = c;
    });
    if (cols.code !== undefined && (cols.balance !== undefined || (cols.debit !== undefined && cols.credit !== undefined)))
      return { row: r, cols };
  }
  return null;
}

export function parseTbGrid(grid: Cell[][], opts: { functionalCurrency: string }): TbParse {
  const issues: Issue[] = [];
  const empty: TbParse = { headerRow: null, columns: {}, signMode: null, groupRowsSkipped: 0, lines: [],
    totals: { balance: ZERO, reporting: ZERO }, issues };
  const h = findHeader(grid);
  if (!h) {
    issues.push({ severity: 'ERROR', code: 'HEADER_NOT_FOUND',
      message: 'No header row with an account column and either a balance column or debit and credit columns ' +
        '(e.g. "Cuenta", "Saldo final" / "Account", "Debit", "Credit").' });
    return empty;
  }
  const { cols } = h;
  const foreign = opts.functionalCurrency !== 'USD';
  if (foreign && cols.usd === undefined) {
    issues.push({ severity: 'ERROR', code: 'NEEDS_USD_COLUMN',
      message: `The entity keeps its books in ${opts.functionalCurrency}: the file needs a USD column (the portal's translation engine comes in Phase 2).` });
    return { ...empty, headerRow: h.row + 1, columns: cols };
  }

  // Raw rows: as the file states them, before sign convention and leaf filtering.
  type Raw = { row: number; code: string; name: string; raw: Decimal; rawUsd: Decimal };
  const raws: Raw[] = [];
  for (let r = h.row + 1; r < grid.length; r++) {
    const cells = grid[r] ?? [];
    const code = codeText(cells[cols.code!]);
    if (!code || !/\d/.test(code)) continue; // blank, section titles, "Total"
    const get = (c: number | undefined) => (c === undefined ? ZERO : toAmount(cells[c]));
    const bal = cols.balance !== undefined ? get(cols.balance) : (() => {
      const d = get(cols.debit), c = get(cols.credit);
      return d === null || c === null ? null : d.minus(c);
    })();
    const usd = foreign ? get(cols.usd) : bal;
    if (bal === null || usd === null) {
      issues.push({ severity: 'ERROR', code: 'BAD_AMOUNT', row: r + 1, message: `Account ${code}: an amount is not a number` });
      continue;
    }
    raws.push({ row: r + 1, code, name: String(cells[cols.name ?? -1] ?? '').trim(), raw: bal, rawUsd: usd });
  }
  if (!raws.length) {
    issues.push({ severity: 'ERROR', code: 'NO_ROWS', message: 'No account rows under the header.' });
    return { ...empty, headerRow: h.row + 1, columns: cols };
  }

  // Hierarchy: a code that prefixes other codes is a group row; only the lowest-level accounts carry postings.
  // Group totals in real files don't always add up (Lunic Sep-26: 6103 omits its negative sub-account), so they are
  // never used for figures. The TB balance check below proves the kept accounts are complete.
  const codes = raws.map(x => x.code);
  const isGroup = (x: Raw) => codes.some(c => c !== x.code && c.startsWith(x.code));
  const kept = raws.filter(x => !isGroup(x));
  const groups = raws.filter(isGroup);
  const groupRowsSkipped = groups.length;
  const mismatched = groups.filter(g => {
    const sum = kept.filter(l => l.code.startsWith(g.code)).reduce((t, l) => t.plus(l.raw.abs()), ZERO);
    const net = kept.filter(l => l.code.startsWith(g.code)).reduce((t, l) => t.plus(l.raw), ZERO);
    return g.raw.minus(net).abs().gt('0.01') && g.raw.minus(sum).abs().gt('0.01');
  });
  if (mismatched.length)
    issues.push({ severity: 'WARNING', code: 'GROUP_TOTAL_MISMATCH',
      message: `${mismatched.length} group total(s) in the file don't equal their accounts (${mismatched.slice(0, 5).map(g => g.code).join(', ')}${mismatched.length > 5 ? ', …' : ''}). ` +
        'Only the accounts are used; check the file’s totals with the subsidiary.' });

  // Sign convention.
  const sign = (x: Raw, mode: SignMode) =>
    mode === 'NATURAL_BY_CLASS' && CREDIT_CLASSES.has(x.code.replace(/\D/g, '')[0] ?? '') ? -1 : 1;
  const total = (mode: SignMode, f: (x: Raw) => Decimal) => kept.reduce((t, x) => t.plus(f(x).times(sign(x, mode))), ZERO);
  let signMode: SignMode;
  if (cols.balance === undefined) signMode = 'DEBIT_CREDIT';
  else {
    const signed = total('SIGNED', x => x.raw).abs(), natural = total('NATURAL_BY_CLASS', x => x.raw).abs();
    signMode = natural.lt(signed) ? 'NATURAL_BY_CLASS' : 'SIGNED';
  }

  const lines: TbLineParsed[] = kept.map(x => ({
    row: x.row, code: x.code, name: x.name,
    balance: x.raw.times(sign(x, signMode)), reporting: x.rawUsd.times(sign(x, signMode)),
  }));

  const seen = new Map<string, number>();
  for (const l of lines) {
    if (seen.has(l.code)) issues.push({ severity: 'ERROR', code: 'DUPLICATE_ACCOUNT', row: l.row, message: `Account ${l.code} appears twice (rows ${seen.get(l.code)} and ${l.row})` });
    else seen.set(l.code, l.row);
  }
  const totals = {
    balance: lines.reduce((t, l) => t.plus(l.balance), ZERO),
    reporting: lines.reduce((t, l) => t.plus(l.reporting), ZERO),
  };
  if (totals.balance.abs().gt(TOLERANCE))
    issues.push({ severity: 'WARNING', code: 'TB_NOT_BALANCED',
      message: `Debits and credits differ by ${totals.balance.toFixed(2)} ${opts.functionalCurrency}. Approval will need a documented exception.` });
  if (foreign && totals.reporting.abs().gt(TOLERANCE))
    issues.push({ severity: 'WARNING', code: 'USD_NOT_BALANCED',
      message: `The USD column nets to ${totals.reporting.toFixed(2)} USD although the ${opts.functionalCurrency} balances: a translation difference not booked to CTA.` });

  return { headerRow: h.row + 1, columns: cols, signMode, groupRowsSkipped, lines, totals, issues };
}

/** A CSV file as a grid. Handles quoted fields with commas, quotes and line breaks. */
export function csvToGrid(text: string): Cell[][] {
  const rows: Cell[][] = [];
  let row: Cell[] = [], field = '', quoted = false;
  const s = text.replace(/^﻿/, '');
  const sep = (s.split('\n', 1)[0] ?? '').split(';').length > (s.split('\n', 1)[0] ?? '').split(',').length ? ';' : ',';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
