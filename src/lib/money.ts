// Exact decimal arithmetic for every financial figure. JS numbers never carry money here.
import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export type Amount = Decimal;

export const ZERO = new Decimal(0);

/** Parse a figure from a file or the database. Rejects anything that is not a finite number. */
export function amount(v: Decimal.Value | { toString(): string } | null | undefined): Decimal {
  if (v === null || v === undefined || v === '') return ZERO;
  const d = new Decimal(typeof v === 'object' && !(v instanceof Decimal) ? v.toString() : (v as Decimal.Value));
  if (!d.isFinite()) throw new Error(`Not a finite amount: ${String(v)}`);
  return d;
}

/** The portal's sign convention: debit − credit. Debits positive, credits negative. */
export function signedBalance(debit: Decimal.Value, credit: Decimal.Value): Decimal {
  return amount(debit).minus(amount(credit));
}

/** Split a signed balance into the debit/credit pair stored on a TB line. */
export function toDebitCredit(balance: Decimal.Value): { debit: Decimal; credit: Decimal } {
  const b = amount(balance);
  return b.isNegative() ? { debit: ZERO, credit: b.negated() } : { debit: b, credit: ZERO };
}

export function sum(values: Iterable<Decimal.Value>): Decimal {
  let t = ZERO;
  for (const v of values) t = t.plus(amount(v));
  return t;
}

/**
 * Activity for one period from cumulative period-end balances (Databook convention, handoff §3).
 * BS balances carry forward, so activity = this period − prior period.
 * PL balances are year-to-date and restart each fiscal year, so the first month's activity is its own balance.
 */
export function periodActivity(args: {
  statement: 'BS' | 'PL';
  current: Decimal.Value;
  prior: Decimal.Value | null;
  isFirstMonthOfYear: boolean;
}): Decimal {
  const current = amount(args.current);
  if (args.statement === 'PL' && args.isFirstMonthOfYear) return current;
  return current.minus(amount(args.prior ?? 0));
}

/** True when debits equal credits, i.e. the signed balances net to zero within the tolerance. */
export function isBalanced(balances: Iterable<Decimal.Value>, tolerance: Decimal.Value = 0): boolean {
  return sum(balances).abs().lte(amount(tolerance));
}

/** Two-decimal string for display and comparisons to the cent. */
export function cents(v: Decimal.Value): string {
  return amount(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
