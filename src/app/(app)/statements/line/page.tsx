import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatMoney, messages } from '@/lib/i18n';
import { Decimal, ZERO, sum } from '@/lib/money';
import { ALL_LINES } from '@/lib/statements/layout';
import { loadStatementInputs, type DetailLine } from '@/lib/statements/load';
import { detailLinesOf, present } from '@/lib/statements/present';
import { CONSOLIDATED, visibleEntities } from '../data';
import { parseParams, query, type RawParams } from '../params';

export const dynamic = 'force-dynamic';

/** A statement figure → the standard accounts and source accounts (TB lines) that make it up. Always YTD balances. */
export default async function LineDrill({ searchParams }: { searchParams: Promise<RawParams> }) {
  const s = await requirePermission('VIEW_STATEMENTS');
  const t = messages(s.locale);
  const ts = t.statements;
  const sp = await searchParams;
  const p = parseParams(sp);
  const lineCode = typeof sp.line === 'string' ? sp.line : '';
  const entityParam = typeof sp.entity === 'string' ? sp.entity : '';
  const line = ALL_LINES.find(l => l.code === lineCode);
  if (!line || !p.period) notFound();

  const { codes, canConsolidate } = await visibleEntities(s);
  // Server-side scope check: the URL is user input.
  if (entityParam === CONSOLIDATED ? !canConsolidate : !codes.includes(entityParam)) notFound();
  const entities = entityParam === CONSOLIDATED ? codes : [entityParam];

  const inputs = await loadStatementInputs(db, { periodKey: p.period, entityCodes: entities, basis: p.basis });
  const wanted = new Set(detailLinesOf(line.code));
  const rows = inputs.details.filter(d => wanted.has(d.lineCode));
  const show = (v: Decimal.Value) => formatMoney(present(line.code, new Decimal(v), p.signs), s.locale, 2);

  // detail line → std account → TB lines
  const byLine = new Map<string, Map<string, DetailLine[]>>();
  const order = (code: string) => ALL_LINES.findIndex(l => l.code === code);
  rows.sort((a, b) => order(a.lineCode) - order(b.lineCode) || a.stdAccountCode.localeCompare(b.stdAccountCode));
  for (const r of rows) {
    const g = byLine.get(r.lineCode) ?? new Map<string, DetailLine[]>();
    g.set(r.stdAccountCode, [...(g.get(r.stdAccountCode) ?? []), r]);
    byLine.set(r.lineCode, g);
  }
  const total = sum(rows.map(r => r.balance));
  const lineName = (code: string) => {
    const l = ALL_LINES.find(x => x.code === code)!;
    return s.locale === 'es' ? l.nameEs : l.nameEn;
  };

  return (
    <>
      <p><a href={`/statements?${query(p)}`}>← {ts.back}</a></p>
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{lineName(line.code)}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {entityParam === CONSOLIDATED ? ts.consolidated : entityParam} · {p.period} · {ts.ytdNote}
      </p>

      {rows.length === 0 ? <p className="muted">{ts.noLines}</p> : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>{ts.stdAccount}</th><th>{ts.entity}</th><th>{ts.account}</th><th>{ts.mapping}</th>
                <th className="num">{ts.balance}</th>
              </tr>
            </thead>
            <tbody>
              {[...byLine].map(([lc, stds]) => (
                <LineGroup key={lc} title={wanted.size > 1 ? lineName(lc) : null}>
                  {[...stds].map(([std, accts]) => {
                    const sub = sum(accts.map(a => a.balance));
                    return [
                      <tr key={std} className="subtotal">
                        <td colSpan={4}>{accts[0]!.stdAccountName} <span className="muted">{std}</span></td>
                        <td className="num">{show(sub)}</td>
                      </tr>,
                      ...accts
                        .sort((a, b) => a.entity.localeCompare(b.entity) || a.accountCode.localeCompare(b.accountCode))
                        .map(a => (
                          <tr key={`${a.entity}-${a.sourceAccountId}`}>
                            <td />
                            <td>{a.entity}</td>
                            <td>
                              <a href={`/statements/account/${a.sourceAccountId}?${query(p)}`}>{a.accountCode}</a>{' '}
                              <span className="muted">{a.accountName}</span>
                            </td>
                            <td><span className={`pill ${a.mappingStatus === 'APPROVED' ? 'final' : 'preliminary'}`}>{t.mappingStatus[a.mappingStatus]}</span></td>
                            <td className="num">{show(a.balance)}</td>
                          </tr>
                        )),
                    ];
                  })}
                </LineGroup>
              ))}
              <tr className="check">
                <td colSpan={4}>{ts.total}</td>
                <td className="num">{show(total.isZero() ? ZERO : total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function LineGroup({ title, children }: { title: string | null; children: React.ReactNode }) {
  return (
    <>
      {title && <tr><td colSpan={5} style={{ fontWeight: 600, paddingTop: 16 }}>{title}</td></tr>}
      {children}
    </>
  );
}
