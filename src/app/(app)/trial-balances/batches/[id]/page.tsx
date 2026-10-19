import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatMoney, messages } from '@/lib/i18n';
import { previewBatch, type Change } from '@/lib/tb/upload';
import { ALL_LINES } from '@/lib/statements/layout';
import { commitAction, discardAction } from '../../actions';

export const dynamic = 'force-dynamic';
const SHOW = 40;

export default async function BatchPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; submitted?: string }>;
}) {
  const s = await requirePagePermission('VIEW_TB');
  const t = messages(s.locale);
  const tt = t.tb, tb = tt.batch;
  const { id } = await params;
  const sp = await searchParams;
  const p = await previewBatch(db, s, id);
  if (!p) notFound();
  const { batch, parsed } = p;
  const errors = parsed.issues.filter(i => i.severity === 'ERROR');
  const stored = batch.issues.filter(i => !parsed.issues.some(x => x.code === i.code));
  const canCommit = s.permissions.has('UPLOAD_TB') && batch.status === 'VALIDATED' && !errors.length && !p.unchanged;
  const money = (v: Change['before']) => (v === null ? '–' : formatMoney(v, s.locale, 2));

  const std = p.newAccounts.length ? await db.stdAccount.findMany({ include: { statementLine: true } }) : [];
  const order = (c: string) => ALL_LINES.findIndex(l => l.code === c);
  std.sort((a, b) => order(a.statementLine.code) - order(b.statementLine.code) || a.code.localeCompare(b.code));
  const colNames = Object.entries(parsed.columns).map(([k, v]) => `${k}: ${String.fromCharCode(65 + (v as number))}`).join(', ');

  return (
    <>
      <p><a href="/trial-balances">← {tt.title}</a></p>
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{tb.title}: {batch.entity!.code} {batch.period!.key}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{batch.fileName} · {batch.uploadedBy?.fullName} · <span className="pill">{batch.status}</span></p>
      {sp.submitted && <p className="notice" role="status">{tb.submitted(Number(sp.submitted))}</p>}
      {sp.error && <p className="notice error-notice" role="alert">{tt.errors[sp.error] ?? sp.error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <section className="card">
          <h3 style={{ marginTop: 0 }}>{tb.detected}</h3>
          <dl className="facts">
            <dt>{tb.sheet}</dt><dd>{parsed.sheet ?? 'CSV'}</dd>
            <dt>{tb.headerRow}</dt><dd>{parsed.headerRow ?? '–'}</dd>
            <dt>{tb.columns}</dt><dd>{colNames || '–'}</dd>
            <dt>{tb.signs}</dt><dd>{parsed.signMode ? tb.signModes[parsed.signMode] : '–'}</dd>
            <dt>{tb.groups}</dt><dd>{parsed.groupRowsSkipped}</dd>
            <dt>{tb.accounts}</dt><dd>{parsed.lines.length}</dd>
          </dl>
        </section>
        <section className="card">
          <h3 style={{ marginTop: 0 }}>{tb.totals}</h3>
          <dl className="facts">
            <dt>{tb.functional} ({batch.entity!.functionalCurrency})</dt><dd className="num">{formatMoney(parsed.totals.balance, s.locale, 2)}</dd>
            {batch.entity!.functionalCurrency !== 'USD' && <><dt>{tb.reporting}</dt><dd className="num">{formatMoney(parsed.totals.reporting, s.locale, 2)}</dd></>}
            <dt>{tb.current}</dt><dd>{p.current ? `v${p.current.version} · ${t.submissionStatus[p.current.status as keyof typeof t.submissionStatus]} · ${p.current.batchFile}` : tb.none}</dd>
          </dl>
        </section>
      </div>

      <h3>{tb.issues}</h3>
      {parsed.issues.length + stored.length === 0 ? <p className="muted">{tb.noIssues}</p> : (
        <ul className="issues">
          {[...parsed.issues, ...stored.map(i => ({ severity: i.severity, code: i.code, row: i.rowNumber ?? undefined, message: i.message }))].map((i, n) => (
            <li key={n} className={i.severity === 'ERROR' ? 'bad' : ''}><strong>{i.severity}</strong> {i.code}{i.row ? ` (row ${i.row})` : ''}: {i.message}</li>
          ))}
        </ul>
      )}

      {p.unchanged && <p className="notice">{tb.unchanged}</p>}

      {p.changes.length > 0 && (
        <>
          <h3>{tb.changes} <span className="muted" style={{ fontWeight: 400 }}>{tb.showing(Math.min(SHOW, p.changes.length), p.changes.length)} · USD</span></h3>
          <div className="scroll">
            <table>
              <thead><tr><th>{t.statements.account}</th><th className="num">{tb.before}</th><th className="num">{tb.after}</th><th className="num">{tb.diff}</th></tr></thead>
              <tbody>
                {p.changes.slice(0, SHOW).map(c => (
                  <tr key={c.code}><td>{c.code} <span className="muted">{c.name}</span></td>
                    <td className="num">{money(c.before)}</td><td className="num">{money(c.after)}</td><td className="num">{money(c.diff)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {p.removed.length > 0 && (
        <>
          <h3>{tb.removed} <span className="pill missing">{p.removed.length}</span></h3>
          <p className="notice">{tb.removedHint}</p>
          <table>
            <tbody>
              {p.removed.map(c => <tr key={c.code}><td>{c.code} <span className="muted">{c.name}</span></td><td className="num">{money(c.before)}</td></tr>)}
            </tbody>
          </table>
        </>
      )}

      {batch.status === 'VALIDATED' && (
        <form action={commitAction} style={{ marginTop: 24 }}>
          <input type="hidden" name="batchId" value={batch.id} />
          {p.newAccounts.length > 0 && (
            <>
              <h3>{tb.newAccounts} <span className="pill">{p.newAccounts.length}</span></h3>
              <p className="muted">{tb.newHint}</p>
              <table>
                <tbody>
                  {p.newAccounts.map(a => (
                    <tr key={a.code}>
                      <td>{a.code} <span className="muted">{a.name}</span></td>
                      <td className="num">{formatMoney(a.reporting, s.locale, 2)}</td>
                      <td>
                        <select name={`map:${a.code}`} defaultValue={a.suggestion ?? ''} required aria-label={a.code}>
                          <option value="">—</option>
                          {std.map(x => <option key={x.id} value={x.id}>{x.statementLine.nameEn} › {x.nameEn}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <div className="bulk">
            <button type="submit" disabled={!canCommit}>{tb.submit}</button>
          </div>
        </form>
      )}
      {['VALIDATED', 'FAILED', 'DUPLICATE'].includes(batch.status) && s.permissions.has('UPLOAD_TB') && (
        <form action={discardAction}>
          <input type="hidden" name="batchId" value={batch.id} />
          <button type="submit" className="secondary">{tb.discard}</button>
        </form>
      )}
    </>
  );
}
