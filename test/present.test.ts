import { describe, expect, it } from 'vitest';
import { amount, cents } from '@/lib/money';
import { detailLinesOf, displaySign, monthFromYtd, present, previousPeriodKey } from '@/lib/statements/present';

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

describe('previousPeriodKey', () => {
  it('steps back a month, across year end', () => {
    expect(previousPeriodKey('2026-09')).toBe('2026-08');
    expect(previousPeriodKey('2026-01')).toBe('2025-12');
  });
});
