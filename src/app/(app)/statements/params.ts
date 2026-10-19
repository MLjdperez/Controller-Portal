// Shared query parameters for the statements pages. Unknown values fall back to defaults; nothing is trusted.
import type { Basis } from '@/lib/statements/load';
import type { SignMode } from '@/lib/statements/present';

export type StatementParams = {
  period: string | undefined;
  stmt: 'BS' | 'PL';
  view: 'ytd' | 'month';
  basis: Basis;
  signs: SignMode;
};

export type RawParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseParams(sp: RawParams): StatementParams {
  const period = one(sp.period);
  return {
    period: period && /^\d{4}-\d{2}$/.test(period) ? period : undefined,
    stmt: one(sp.stmt) === 'BS' ? 'BS' : 'PL',
    view: one(sp.view) === 'month' ? 'month' : 'ytd',
    basis: one(sp.basis) === 'approved' ? 'APPROVED' : 'LATEST',
    signs: one(sp.signs) === 'raw' ? 'raw' : 'natural',
  };
}

export function query(p: StatementParams, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({
    ...(p.period ? { period: p.period } : {}),
    stmt: p.stmt, view: p.view, basis: p.basis === 'APPROVED' ? 'approved' : 'latest', signs: p.signs, ...extra,
  });
  return q.toString();
}
