import { describe, expect, it } from 'vitest';
import { amount, cents, isBalanced, periodActivity, signedBalance, sum, toDebitCredit } from '@/lib/money';

describe('money', () => {
  it('adds without float drift', () => {
    expect(sum(['0.1', '0.2']).toString()).toBe('0.3');
    // A float would give 0.30000000000000004 here.
    expect(cents(sum(['0.1', '0.2']))).toBe('0.30');
  });

  it('keeps LSA sub-cent precision until display', () => {
    const v = amount('-0.5556673999999999');
    expect(v.toString()).toBe('-0.5556673999999999');
    expect(cents(v)).toBe('-0.56');
  });

  it('uses debit − credit, debits positive', () => {
    expect(signedBalance('100', '0').toString()).toBe('100');
    expect(signedBalance(0, '39659.27').toString()).toBe('-39659.27');
  });

  it('splits a signed balance into debit and credit', () => {
    expect(toDebitCredit('-25.5')).toEqual({ debit: amount(0), credit: amount('25.5') });
    expect(toDebitCredit('12')).toEqual({ debit: amount(12), credit: amount(0) });
    const { debit, credit } = toDebitCredit('-676655.88');
    expect(signedBalance(debit, credit).toString()).toBe('-676655.88');
  });

  it('rejects values that are not finite numbers', () => {
    expect(() => amount('abc')).toThrow();
    expect(() => amount(Infinity)).toThrow();
  });

  it('treats an empty cell as zero', () => {
    expect(amount('').isZero()).toBe(true);
    expect(amount(null).isZero()).toBe(true);
  });
});

describe('periodActivity (Databook cumulative balances)', () => {
  it('BS: activity is the change in balance', () => {
    // Elim tab, 11800-000-00, Jan → Feb 2025.
    expect(periodActivity({ statement: 'BS', current: '-660596.97', prior: '-676655.88', isFirstMonthOfYear: false })
      .toString()).toBe('16058.91');
  });

  it('BS: January still compares to December — balances carry forward', () => {
    expect(periodActivity({ statement: 'BS', current: '150', prior: '100', isFirstMonthOfYear: true }).toString()).toBe('50');
  });

  it('PL: January is its own activity — YTD restarts at BB2', () => {
    expect(periodActivity({ statement: 'PL', current: '-1000', prior: '-90000', isFirstMonthOfYear: true }).toString()).toBe('-1000');
  });

  it('PL: later months are YTD minus prior YTD', () => {
    expect(periodActivity({ statement: 'PL', current: '-3000', prior: '-1000', isFirstMonthOfYear: false }).toString()).toBe('-2000');
  });

  it('handles a missing prior period as zero', () => {
    expect(periodActivity({ statement: 'BS', current: '10', prior: null, isFirstMonthOfYear: false }).toString()).toBe('10');
  });
});

describe('isBalanced', () => {
  it('is true when debits equal credits', () => {
    expect(isBalanced(['100', '-60', '-40'])).toBe(true);
  });
  it('is false by a cent without tolerance', () => {
    expect(isBalanced(['100', '-99.99'])).toBe(false);
    expect(isBalanced(['100', '-99.99'], '0.01')).toBe(true);
  });
});
