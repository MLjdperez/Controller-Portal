import type { Locale } from '@prisma/client';
import { en, type Messages } from '@/messages/en';
import { es } from '@/messages/es';
import { amount } from './money';
import type Decimal from 'decimal.js';

/** Language follows the user record, not the browser, so it is the same on every device. */
export function messages(locale: Locale): Messages {
  return locale === 'es' ? es : en;
}

const tag = (locale: Locale) => (locale === 'es' ? 'es-US' : 'en-US');

/**
 * Display only. Formats from the exact decimal's string so nothing is rounded through a float first.
 * Negative figures show in parentheses, as on the Databook statements.
 */
export function formatMoney(value: Decimal.Value, locale: Locale, fractionDigits = 0): string {
  const d = amount(value).toDecimalPlaces(fractionDigits);
  const [int = '0', frac] = d.abs().toFixed(fractionDigits).split('.');
  const grouped = new Intl.NumberFormat(tag(locale), { useGrouping: true }).format(BigInt(int));
  const sep = new Intl.NumberFormat(tag(locale)).formatToParts(1.1).find(p => p.type === 'decimal')?.value ?? '.';
  const body = frac ? `${grouped}${sep}${frac}` : grouped;
  return d.isNegative() && !d.isZero() ? `(${body})` : body;
}

export function formatDate(d: Date, locale: Locale) {
  return new Intl.DateTimeFormat(tag(locale), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}
