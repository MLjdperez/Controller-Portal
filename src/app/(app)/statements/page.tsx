import { requirePermission } from '@/lib/auth';
import { formatMoney, messages } from '@/lib/i18n';
import { ZERO } from '@/lib/money';
import { BS_LINES, PL_LINES } from '@/lib/statements/layout';
import { monthFromYtd, present } from '@/lib/statements/present';
import { CONSOLIDATED, resolvePeriod, statementData, visibleEntities } from './data';
import { parseParams, query, type RawParams } from './params';

export const dynamic = 'force-dynamic';

export default async function StatementsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const s = await requirePermission('VIEW_STATEMENTS');
  const t = messages(s.locale);
  const ts = t.statements;
  const p = parseParams(await searchParams);
  const { period, periods } = await resolvePeriod(p.period);
  if (!period) return <p className="muted">{t.dashboard.noData}</p>;
  const params = { ...p, period: period.key };

  const { codes, canConsolidate } = await visibleEntities(s);
  const data = await statementData(params, period.key, codes);
  const columns = canConsolidate ? [...codes, CONSOLIDATED] : codes;
  const lines = p.stmt === 'BS' ? BS_LINES : PL_LINES;
  const monthView = p.stmt === 'PL' && p.view === 'month';

  const value = (code: string, col: string) => {
    const ytd = data.result.amounts.get(code)?.get(col) ?? ZERO;
    const v = monthView ? monthFromYtd(ytd, data.prior?.amounts.get(code)?.get(col) ?? null, data.isFirstMonth) : ytd;
    return present(code, v, p.signs);
  };

  const reasons: string[] = [];
  for (const e of data.inputs.entities) {
    if (!e.submission) reasons.push(ts.missingTb(e.entity));
    else if (e.submission.status !== 'APPROVED' || e.unapprovedMappings)
      reasons.push(ts.unapproved(e.entity, t.submissionStatus[e.submission.status], e.submission.version, e.unapprovedMappings));
    if (e.unmappedAccounts.length) reasons.push(ts.unmapped(e.entity, e.unmappedAccounts.length));
  }

  const tab = (label: string, extra: Record<string, string>, active: boolean) =>
    <a href={`/statements?${query(params, extra)}`} className={`tab${active ? ' active' : ''}`}>{label}</a>;

  return (
    <>
      <div className="top" style={{ alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>{ts.title}</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>{ts.ytdNote}</p>
        </div>
        <span className={`pill ${data.inputs.isFinal ? 'final' : 'preliminary'}`} title={ts.preliminaryWhy}>
          {data.inputs.isFinal ? ts.final : ts.preliminary}
        </span>
      </div>

      <form className="controls" method="get">
        <div className="tabs">
          {tab(ts.pl, { stmt: 'PL' }, p.stmt === 'PL')}
          {tab(ts.bs, { stmt: 'BS' }, p.stmt === 'BS')}
        </div>
        <input type="hidden" name="stmt" value={p.stmt} />
        <label>{t.dashboard.period}
          <select name="period" defaultValue={period.key}>
            {periods.map(x => <option key={x.id} value={x.key}>{x.key}</option>)}
          </select>
        </label>
        {p.stmt === 'PL' && (
          <label>{ts.show}
            <select name="view" defaultValue={p.view}>
              <option value="ytd">{ts.ytd}</option>
              <option value="month">{ts.month}</option>
            </select>
          </label>
        )}
        <label>&nbsp;
          <select name="basis" defaultValue={p.basis === 'APPROVED' ? 'approved' : 'latest'}>
            <option value="latest">{ts.basisLatest}</option>
            <option value="approved">{ts.basisApproved}</option>
          </select>
        </label>
        <label>&nbsp;
          <select name="signs" defaultValue={p.signs}>
            <option value="natural">{ts.signsNatural}</option>
            <option value="raw">{ts.signsRaw}</option>
          </select>
        </label>
        <button type="submit">OK</button>
      </form>

      {!data.inputs.isFinal && reasons.length > 0 && (
        <details className="notice">
          <summary>{ts.preliminaryWhy}</summary>
          <ul>{reasons.map(r => <li key={r}>{r}</li>)}</ul>
        </details>
      )}
      {monthView && data.priorMissing && <p className="notice">{ts.monthNoPrior}</p>}
      {!canConsolidate && <p className="muted">{ts.consolidatedHidden}</p>}

      <div className="scroll">
        <table className="statement">
          <thead>
            <tr>
              <th>{ts.line}</th>
              {columns.map(c => <th key={c} className="num">{c === CONSOLIDATED ? ts.consolidated : c}</th>)}
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.code} className={l.kind === 'SUBTOTAL' ? 'subtotal' : ''}>
                <td>{s.locale === 'es' ? l.nameEs : l.nameEn}</td>
                {columns.map(c => {
                  const v = value(l.code, c);
                  return (
                    <td key={c} className="num">
                      <a href={`/statements/line?${query(params, { line: l.code, entity: c })}`}>
                        {v.isZero() ? '–' : formatMoney(v, s.locale)}
                      </a>
                    </td>
                  );
                })}
              </tr>
            ))}
            {p.stmt === 'BS' && (
              <tr className="check">
                <td>{ts.outOfBalance}</td>
                {columns.map(c => {
                  const d = data.result.checks.bsDifference.get(c) ?? ZERO;
                  return <td key={c} className={`num${d.abs().gte('0.005') ? ' bad' : ''}`}>{formatMoney(d, s.locale, 2)}</td>;
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>{ts.drillHint}</p>
    </>
  );
}
