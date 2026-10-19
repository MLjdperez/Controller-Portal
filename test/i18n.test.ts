import { describe, expect, it } from 'vitest';
import { formatMoney, messages } from '@/lib/i18n';
import { en } from '@/messages/en';
import { es } from '@/messages/es';

const keys = (o: object, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe('i18n', () => {
  it('Spanish covers every English label', () => {
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });

  it('picks the catalog by user locale', () => {
    expect(messages('es').nav.dashboard).toBe('Tablero ejecutivo');
    expect(messages('en').nav.dashboard).toBe('Executive Dashboard');
  });

  it('formats exact decimals, negatives in parentheses', () => {
    expect(formatMoney('-86383470', 'en')).toBe('(86,383,470)');
    expect(formatMoney('1234567.891', 'en', 2)).toBe('1,234,567.89');
    expect(formatMoney('0', 'en')).toBe('0');
  });

  it('does not lose digits beyond float precision', () => {
    expect(formatMoney('12345678901234567.89', 'en', 2)).toBe('12,345,678,901,234,567.89');
  });
});
