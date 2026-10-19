// Parser and engine on a synthetic Databook built in memory: no real financial data in the repo.
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseDatabook, periodForHeader, readNumber } from '@/lib/databook/parse';
import { checkOpenings } from '@/lib/databook/openings';
import { computeStatements, CONSOLIDATED } from '@/lib/statements/engine';
import { balancesFromParsed } from '@/lib/databook/compare';
import { lineForL1 } from '@/lib/statements/layout';
import { cents } from '@/lib/money';

const HEAD = ['Cuenta', 'Nombre', 'TB Account Name English', 'Entity', 'PL/BS', 'BS Type', 'Account Type', 'IC', 'L1', 'L2', 'L3',
  'Crowe', "Dec '24", 'BB', 'Jan', 'Feb'];
const ELIM_HEAD = [...HEAD.slice(0, 7), 'Ref', ...HEAD.slice(7)];

type Row = (string | number | null | { formula: string; result?: number })[];

function book(tabs: Record<string, { head?: string[]; rows: Row[] }>) {
  const wb = new ExcelJS.Workbook();
  for (const [name, t] of Object.entries(tabs)) {
    const ws = wb.addWorksheet(name);
    ws.getRow(6).values = t.head ?? HEAD;
    t.rows.forEach((r, i) => { ws.getRow(7 + i).values = r as ExcelJS.CellValue[]; });
  }
  return wb;
}

// A tiny but balanced group. Signed debit − credit; PL is YTD.
const MLF: Row[] = [
  ['10010-000-00', 'Checking', 'Checking', 'Mama Lycha', 'BS', 'Assets', 'Current assets', null, 'Cash and cash equivalents', 'Cash and cash equivalents', 'Checking', 0, 1000, 1000, 1500, 1700],
  ['11007-000-00', 'IC AR', 'IC AR', 'Mama Lycha', 'BS', 'Assets', 'Current assets', 'IC', 'Accounts receivable, net', 'Accounts receivable, net', 'IC AR', 0, 200, 200, 200, 200],
  ['32000-000-00', 'RE', 'RE', 'Mama Lycha', 'BS', 'Equity', 'Equity', null, 'Retained Earnings', 'Retained earnings', 'RE', 0, -1200, -1200, -1200, -1200],
  ['40000-000-00', 'Sales', 'Sales', 'Mama Lycha', 'PL', null, null, null, 'Product sales', 'Product sales', 'Sales', 0, 0, 0, -800, -1000],
  // Formula with a cached result, and one Excel saved without a cache (a zero result).
  ['50000-000-00', 'Cost', 'Cost', 'Mama Lycha', 'PL', null, null, null, 'Product cost', 'Product cost', 'Cost', 0, 0, 0, { formula: 'X1', result: 300 }, { formula: 'X2', result: 300 }],
  ['60000-000-00', 'Unused', 'Unused', 'Mama Lycha', 'PL', null, null, null, 'Payroll & benefits', 'Payroll & benefits', 'Unused', 0, 0, 0, { formula: 'X3' }, 0],
  // Totals row under the table: skipped.
  [null, null, null, null, null, null, null, null, null, null, null, null, 0, 0, 999, 999],
];
const MLB: Row[] = [
  // No account number: a real line, given a portal code.
  [null, 'Investment In Subs', null, 'ML Buyer', 'BS', 'Assets', 'Non-current', null, 'Other assets', 'Other assets', 'Investment', 0, 500, 500, 500, 500],
  [null, 'Newco Equity', null, 'ML Buyer', 'BS', 'Equity', 'Equity', null, 'Common stock', 'Common stock', 'Equity', 0, -500, -500, -500, -500],
  // A subtotal name as L1, all zero: excluded with a warning, as the Databook's SUMIF does.
  [null, 'Transaction Expenses', null, 'ML Buyer', 'PL', null, null, null, 'Operating expenses', 'Operating expenses', 'x', 0, 0, 0, 0, 0],
];
const ELIM: Row[] = [
  // The same account under two reference letters adds into one ELIM balance.
  ['11007-000-00', 'IC AR', 'IC AR', 'Elim', 'BS', 'Assets', 'Current assets', 'a', 'Mama Lycha', 'Accounts receivable, net', 'Accounts receivable, net', 'IC AR', 0, -150, -150, -150, -150],
  ['11007-000-00', 'IC AR', 'IC AR', 'Elim', 'BS', 'Assets', 'Current assets', 'b', 'Mama Lycha', 'Accounts receivable, net', 'Accounts receivable, net', 'IC AR', 0, -50, -50, -50, -50],
  ['32000-000-00', 'RE', 'RE', 'Elim', 'BS', 'Equity', 'Equity', 'a', 'Mama Lycha', 'Retained earnings', 'Retained earnings', 'RE', 0, 200, 200, 200, 200],
];
const empty = (entity: string): Row[] => [['1', 'x', 'x', entity, 'BS', 'Assets', 'Current assets', null, 'Cash and cash equivalents', 'Cash', 'x', 0, 0, 0, 0, 0]];

const group = () => book({
  MLB: { rows: MLB }, MLF: { rows: MLF }, MLL: { rows: empty('Logistics') }, GSA: { rows: empty('Gotera') },
  LSA: { rows: empty('Lunic') }, Elim: { head: ELIM_HEAD, rows: ELIM },
});

describe('periodForHeader', () => {
  it('maps the Databook headers to periods', () => {
    expect(periodForHeader("Dec '24")).toBe('2024-12');
    expect(periodForHeader('Dec24')).toBe('2024-12');
    expect(periodForHeader('Jan')).toBe('2025-01');
    expect(periodForHeader('Dec')).toBe('2025-12');
    expect(periodForHeader('Sep-26')).toBe('2026-09');
    expect(periodForHeader('BB')).toBeNull();
    expect(periodForHeader('Crowe')).toBeNull();
  });
});

describe('readNumber', () => {
  it('reads an error result as an error, not zero', () => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('x');
    ws.getCell('A1').value = { formula: '1/0', result: { error: '#DIV/0!' } } as ExcelJS.CellValue;
    expect(readNumber(ws.getCell('A1'))).toEqual({ error: '#DIV/0!' });
  });
});

describe('parseDatabook', () => {
  const parsed = parseDatabook(group(), { through: '2025-02' });
  const acct = (entity: string, code: string) => parsed.entities.find(e => e.entity === entity)!.accounts.find(a => a.code === code)!;

  it('parses without errors and keeps the period order', () => {
    expect(parsed.issues.filter(i => i.severity === 'ERROR')).toEqual([]);
    expect(parsed.periods).toEqual(['2024-12', '2025-01', '2025-02']);
  });

  it('matches L1 case-insensitively, as Excel SUMIF does', () => {
    expect(acct('MLF', '32000-000-00').lineCode).toBe('BS.RETAINED_EARNINGS');
  });

  it('reads cached formula results and treats a missing cache as zero', () => {
    expect(acct('MLF', '50000-000-00').balances.get('2025-01')!.toString()).toBe('300');
    expect(acct('MLF', '60000-000-00').balances.get('2025-01')!.isZero()).toBe(true);
  });

  it('keeps uncoded lines under a portal code, flagged', () => {
    expect(acct('MLB', '~Investment In Subs').balances.get('2025-02')!.toString()).toBe('500');
    expect(parsed.issues.filter(i => i.code === 'NO_ACCOUNT_CODE').length).toBe(3);
  });

  it('excludes a zero balance on a subtotal L1 with a warning', () => {
    expect(parsed.issues.some(i => i.code === 'UNKNOWN_L1' && i.severity === 'WARNING')).toBe(true);
  });

  it('rolls Elim lines with the same account into one balance and keeps the refs and counterparty', () => {
    const a = acct('ELIM', '11007-000-00');
    expect(a.balances.get('2025-01')!.toString()).toBe('-200');
    expect(a.eliminationRefs).toEqual(['a', 'b']);
    expect(a.icCounterparty).toBe('MLF');
  });

  it('rejects a non-zero balance on an unknown L1', () => {
    const bad = book({ ...Object.fromEntries(['MLB', 'MLF', 'MLL', 'GSA', 'LSA'].map(t => [t, { rows: [] }])),
      Elim: { head: ELIM_HEAD, rows: [['9', 'x', 'x', 'Elim', 'PL', null, null, 'a', null, 'Gizmos', 'Gizmos', 'x', 0, 5, 5, 5, 5]] } });
    expect(parseDatabook(bad, { through: '2025-02' }).issues.some(i => i.code === 'UNKNOWN_L1' && i.severity === 'ERROR')).toBe(true);
  });

  it('rejects an account whose Entity column names another company', () => {
    const bad = book({ MLF: { rows: [['1', 'x', 'x', 'Gotera', 'BS', null, null, null, 'Inventory', 'Inventory', 'x', 0, 1, 1, 1, 1]] } });
    expect(parseDatabook(bad, { through: '2025-02' }).issues.some(i => i.code === 'WRONG_ENTITY')).toBe(true);
  });
});

describe('statement engine on the synthetic group', () => {
  const parsed = parseDatabook(group(), { through: '2025-02' });
  const entities = ['MLB', 'MLF', 'MLL', 'GSA', 'LSA', 'ELIM'];
  const st = computeStatements(balancesFromParsed(parsed, '2025-02'), entities);
  const v = (code: string, e: string) => cents(st.amounts.get(code)!.get(e)!);

  it('builds subtotals from detail lines', () => {
    expect(v('PL.NET_REVENUE', 'MLF')).toBe('-1000.00');
    expect(v('PL.GROSS_PROFIT', 'MLF')).toBe('-700.00');
    expect(v('PL.NET_INCOME', 'MLF')).toBe('-700.00');
  });

  it('carries the PL result into the BS net income line', () => {
    expect(v('BS.NET_INCOME', 'MLF')).toBe('-700.00');
  });

  it('balances each entity and the consolidation', () => {
    for (const e of [...entities, CONSOLIDATED]) expect(cents(st.checks.bsDifference.get(e)!)).toBe('0.00');
  });

  it('eliminates the intercompany receivable on consolidation', () => {
    expect(v('BS.AR', 'MLF')).toBe('200.00');
    expect(v('BS.AR', CONSOLIDATED)).toBe('0.00');
  });

  it('refuses balances posted to a subtotal', () => {
    expect(() => computeStatements([{ entity: 'MLF', lineCode: 'PL.GROSS_PROFIT', balance: 1 }], entities)).toThrow();
  });

  it('maps every Databook L1 seen in the 2026 Databook', () => {
    for (const [s, l1] of [['BS', 'Accounts Payable'], ['BS', 'Common Stock'], ['PL', 'Other Income'], ['PL', 'Income Tax'],
      ['BS', 'Prepaid Expenses'], ['PL', 'Tax Expense / Income'], ['BS', 'Notes payables']] as const)
      expect(lineForL1(s, l1)).toBeDefined();
  });
});

describe('checkOpenings', () => {
  it('passes when the opening equals the prior December with the PL closed to retained earnings', () => {
    // MLF has no PL at Dec-24, so BB = Dec '24 rolls forward cleanly.
    const parsed = parseDatabook(group(), { through: '2025-02' });
    expect(checkOpenings(parsed)).toEqual([]);
  });

  it('flags an opening that does not roll forward', () => {
    const rows = MLF.map(r => [...r]);
    rows[2]![13] = -1199; // BB retained earnings keyed 1 off
    const parsed = parseDatabook(book({ MLF: { rows } }), { through: '2025-02' });
    const d = checkOpenings(parsed);
    expect(d.map(x => [x.entity, x.year, x.lineCode, cents(x.diff)])).toEqual([['MLF', '2025', 'BS.RETAINED_EARNINGS', '1.00']]);
  });
});
