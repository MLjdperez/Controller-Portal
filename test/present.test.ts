import { describe, expect, it } from 'vitest';
import { amount, cents } from '@/lib/money';
import { detailLinesOf, displaySign, monthFromYtd, present, previousPeriodKey } from '@/lib/statements/present';
import { computeStatements } from '@/lib/statements/engine';
import { buildView } from '@/lib/statements/view';
import { EBITDA_DEFINITION } from '@/lib/statements/layout';

describe('presentation signs', () => {
  it('shows assets as stored and liabilities/equity flipped', () => {
    expect(displaySign('BS.CASH', 'natural')).toBe(1);
    expect(displaySign('BS.TOTAL_ASSETS', 'natural')).toBe(1);
    expect(displaySign('BS.AP', 'natural')).toBe(-1);
    expect(displaySign('BS.TOTAL_LIABILITIES_EQUITY', 'natural')).toBe(-1);
  });
  it('shows revenue and profit positive', () => {
    expect(cents(present('PL.PRODUCT_SALES', amount('-72806026.93'), 'natural'))).toBe('72806026.93');
    // Net income stored as a debit is a loss: shown negative.
    expect(cents(present('PL.NET_INCOME', amount('4677931.62'), 'natural'))).toBe('-4677931.62');
  });
  it('raw mode shows the Databook signs', () => {
    expect(displaySign('PL.PRODUCT_SALES', 'raw')).toBe(1);
    expect(displaySign('BS.AP', 'raw')).toBe(1);
  });
});

describe('monthFromYtd', () => {
  it('January is its own activity', () => {
    expect(monthFromYtd(amount(-100), amount(-5000), true).toString()).toBe('-100');
  });
  it('later months subtract the prior YTD', () => {
    expect(monthFromYtd(amount(-300), amount(-100), false).toString()).toBe('-200');
  });
});

describe('detailLinesOf', () => {
  it('expands a subtotal to its detail lines', () => {
    expect(detailLinesOf('PL.NET_REVENUE')).toEqual(['PL.PRODUCT_SALES', 'PL.FREIGHT_INCOME', 'PL.DISCOUNTS', 'PL.RETURNS']);
  });
  it('the BS net income line drills into the whole PL', () => {
    expect(detailLinesOf('BS.NET_INCOME')).toContain('PL.PRODUCT_SALES');
    expect(detailLinesOf('BS.NET_INCOME')).toContain('PL.INTEREST');
  });
  it('a detail line is itself', () => {
    expect(detailLinesOf('BS.CASH')).toEqual(['BS.CASH']);
  });
});

describe('EBITDA', () => {
  // A small PL: revenue 1,000; COGS 600; opex 150 incl. depreciation 50; interest 30; tax 20 → net income 200.
  const balances = [
    { entity: 'MLF', lineCode: 'PL.PRODUCT_SALES', balance: '-1000' },
    { entity: 'MLF', lineCode: 'PL.PRODUCT_COST', balance: '600' },
    { entity: 'MLF', lineCode: 'PL.PAYROLL', balance: '100' },
    { entity: 'MLF', lineCode: 'PL.DEPRECIATION', balance: '50' },
    { entity: 'MLF', lineCode: 'PL.INTEREST', balance: '30' },
    { entity: 'MLF', lineCode: 'PL.INCOME_TAX', balance: '20' },
  ];
  const result = computeStatements(balances, ['MLF']);

  it('engine: EBITDA = net income before interest, taxes, D&A', () => {
    expect(cents(result.amounts.get('PL.NET_INCOME')!.get('MLF')!)).toBe('-200.00');
    expect(cents(result.amounts.get('PL.EBITDA')!.get('MLF')!)).toBe('-300.00');
  });

  for (const signs of ['natural', 'raw'] as const) {
    it(`view (${signs} signs): the reconciliation adds up and the margin is 30%`, () => {
      const rows = buildView({ stmt: 'PL', monthView: false, signs, locale: 'en', columns: ['MLF'],
        result, prior: null, isFirstMonth: false });
      const v = (key: string) => rows.find(r => r.key === key)!.values[0]!;
      const parts = [v('EBITDA.BASE'), ...EBITDA_DEFINITION.addBacks.map(c => v(`EBITDA.ADD.${c}`))];
      expect(cents(parts.reduce((t, x) => t.plus(x)))).toBe(cents(v('PL.EBITDA')));
      expect(cents(v('PL.EBITDA'))).toBe(signs === 'natural' ? '300.00' : '-300.00');
      expect(v('EBITDA.MARGIN').toString()).toBe('0.3');
    });
  }

  it('drill-down of EBITDA excludes the add-back lines', () => {
    const lines = detailLinesOf('PL.EBITDA');
    expect(lines).toContain('PL.PRODUCT_SALES');
    expect(lines).not.toContain('PL.INTEREST');
    expect(lines).not.toContain('PL.DEPRECIATION');
  });

  it('margin is not computable without revenue', () => {
    const r = computeStatements([{ entity: 'MLF', lineCode: 'PL.PAYROLL', balance: '10' }], ['MLF']);
    const rows = buildView({ stmt: 'PL', monthView: false, signs: 'natural', locale: 'en', columns: ['MLF'], result: r, prior: null, isFirstMonth: false });
    expect(rows.find(x => x.key === 'EBITDA.MARGIN')!.values[0]).toBeNull();
  });
});

describe('previousPeriodKey', () => {
  it('steps back a month, across year end', () => {
    expect(previousPeriodKey('2026-09')).toBe('2026-08');
    expect(previousPeriodKey('2026-01')).toBe('2025-12');
  });
});
