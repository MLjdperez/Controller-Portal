import { describe, expect, it } from 'vitest';
import { csvToGrid, parseTbGrid, toAmount, type Cell } from '@/lib/tb/parse';
import { cents } from '@/lib/money';

// The shape of Lunic's "Balanza de Comprobación": title rows, a hierarchical chart, natural signs, NIO plus a USD column.
const LUNIC: Cell[][] = [
  [null, 'LUNIC, S.A.'],
  [null, 'BALANZA DE COMPROBACIÓN'],
  [null, 'Expresado en Córdobas', null, null, null, null, 'FX Spot', 36.76],
  [null, 'Nº Cuenta', 'Nombre Cuenta', 'Balance Inicial', 'Débito', 'Crédito', 'Balance Final', null, 'USD'],
  [null, '1', 'ACTIVOS', 0, 0, 0, 3676, null, 100],
  [null, '11', 'ACTIVO CORRIENTE', 0, 0, 0, 3676, null, 100],
  [null, '110101002', 'Caja Chica', 0, 0, 0, 1838, null, 50],
  [null, '110102001', 'Banco', 0, 0, 0, 1838, null, 50],
  [null, '2', 'PASIVOS', 0, 0, 0, 735.2, null, 20],
  [null, '210101', 'Proveedores', 0, 0, 0, 735.2, null, 20],
  [null, '4', 'INGRESOS', 0, 0, 0, 7352, null, 200],
  [null, '4101', 'Ventas', 0, 0, 0, 7352, null, 200],
  [null, '5', 'COSTOS', 0, 0, 0, 4411.2, null, 120],
  [null, '5101', 'Costo de ventas', 0, 0, 0, 4411.2, null, 120],
];

describe('toAmount', () => {
  it('reads accounting formats', () => {
    expect(toAmount('1,234.50')!.toString()).toBe('1234.5');
    expect(toAmount('(1,234.50)')!.toString()).toBe('-1234.5');
    expect(toAmount('-')!.isZero()).toBe(true);
    expect(toAmount('$ 12')!.toString()).toBe('12');
    expect(toAmount('n/a')).toBeNull();
  });
});

describe('parseTbGrid on a Lunic-style balanza', () => {
  const p = parseTbGrid(LUNIC, { functionalCurrency: 'NIO' });

  it('finds the Spanish header below the title rows', () => {
    expect(p.headerRow).toBe(4);
    expect(p.columns).toMatchObject({ code: 1, name: 2, balance: 6, usd: 8 });
  });
  it('keeps only the lowest-level accounts, dropping group totals', () => {
    expect(p.lines.map(l => l.code)).toEqual(['110101002', '110102001', '210101', '4101', '5101']);
    expect(p.groupRowsSkipped).toBe(5);
  });
  it('detects natural signs and turns them into debit − credit', () => {
    expect(p.signMode).toBe('NATURAL_BY_CLASS');
    const by = Object.fromEntries(p.lines.map(l => [l.code, cents(l.balance)]));
    expect(by).toEqual({ '110101002': '1838.00', '110102001': '1838.00', '210101': '-735.20', '4101': '-7352.00', '5101': '4411.20' });
  });
  it('balances in NIO and keeps the USD column signed the same way', () => {
    expect(cents(p.totals.balance)).toBe('0.00');
    expect(p.lines.find(l => l.code === '4101')!.reporting.toString()).toBe('-200');
    expect(cents(p.totals.reporting)).toBe('0.00');
    expect(p.issues).toEqual([]);
  });
});

describe('parseTbGrid: other layouts and failures', () => {
  it('QuickBooks-style debit and credit balance columns', () => {
    const p = parseTbGrid([
      ['Account', 'Name', 'Debit', 'Credit'],
      ['10100-000-20', 'Bank', '1,000.00', ''],
      ['20000-000-00', 'AP', '', '400.00'],
      ['40000-000-00', 'Freight income', '', '600.00'],
      ['TOTAL', '', '1,000.00', '1,000.00'],
    ], { functionalCurrency: 'USD' });
    expect(p.signMode).toBe('DEBIT_CREDIT');
    expect(p.lines.map(l => [l.code, cents(l.balance)])).toEqual([['10100-000-20', '1000.00'], ['20000-000-00', '-400.00'], ['40000-000-00', '-600.00']]);
    expect(p.issues).toEqual([]);
  });

  it('a signed balance column stays as it is', () => {
    const p = parseTbGrid([['Cuenta', 'Saldo'], ['1101', 500], ['2101', -500]], { functionalCurrency: 'USD' });
    expect(p.signMode).toBe('SIGNED');
    expect(cents(p.totals.balance)).toBe('0.00');
  });

  it('a TB that does not balance is a warning, not a silent pass', () => {
    const p = parseTbGrid([['Cuenta', 'Saldo'], ['1101', 500], ['2101', -499.04]], { functionalCurrency: 'USD' });
    expect(p.issues.map(i => i.code)).toEqual(['TB_NOT_BALANCED']);
  });

  it('a USD column that does not balance is flagged as a translation difference', () => {
    const grid = LUNIC.map(r => [...r]);
    grid[13]![8] = 135.28; // cost of sales USD off by 15.28
    grid[12]![8] = 135.28;
    expect(parseTbGrid(grid, { functionalCurrency: 'NIO' }).issues.map(i => i.code)).toContain('USD_NOT_BALANCED');
  });

  it('a non-USD file without a USD column is refused', () => {
    const grid = LUNIC.map(r => r.slice(0, 8));
    expect(parseTbGrid(grid, { functionalCurrency: 'NIO' }).issues.map(i => i.code)).toEqual(['NEEDS_USD_COLUMN']);
  });

  it('no recognisable header is an error that says what it looks for', () => {
    const p = parseTbGrid([['foo', 'bar'], [1, 2]], { functionalCurrency: 'USD' });
    expect(p.issues[0]!.code).toBe('HEADER_NOT_FOUND');
  });

  it('duplicate accounts and unreadable amounts are errors', () => {
    const p = parseTbGrid([['Account', 'Balance'], ['1101', 5], ['1101', -5], ['1102', 'abc']], { functionalCurrency: 'USD' });
    expect(p.issues.map(i => i.code).sort()).toEqual(['BAD_AMOUNT', 'DUPLICATE_ACCOUNT']);
  });

  it('a group total that is not its accounts’ sum is never used, and is flagged', () => {
    const p = parseTbGrid([['Cuenta', 'Saldo'], ['11', 999], ['1101', 500], ['2101', -500]], { functionalCurrency: 'USD' });
    expect(p.lines.map(l => l.code)).toEqual(['1101', '2101']);
    expect(p.issues.map(i => i.code)).toEqual(['GROUP_TOTAL_MISMATCH']);
    expect(cents(p.totals.balance)).toBe('0.00');
  });
});

describe('csvToGrid', () => {
  it('handles quotes, embedded commas and semicolon files', () => {
    expect(csvToGrid('Account,Name,Balance\n1101,"Bank, main",1000\r\n')).toEqual([['Account', 'Name', 'Balance'], ['1101', 'Bank, main', '1000']]);
    expect(csvToGrid('Cuenta;Saldo\n1101;"1.000"\n')).toEqual([['Cuenta', 'Saldo'], ['1101', '1.000']]);
  });
});
