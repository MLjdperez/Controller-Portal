import { requirePermission } from '@/lib/auth';
import { formatMoney, messages } from '@/lib/i18n';
import { EBITDA_DEFINITION } from '@/lib/statements/layout';
import type { ViewRow } from '@/lib/statements/view';
import { CONSOLIDATED, preliminaryReasons, resolvePeriod, statementView } from './data';
import { parseParams, query, type RawParams } from './params';

export const dynamic = 'force-dynamic';

const ROW_CLASS: Record<ViewRow['kind'], string> = {
  DETAIL: '', SUBTOTAL: 'subtotal', MEMO_HEADER: 'memo-header', MEMO: 'memo', MEMO_TOTAL: 'subtotal memo', RATIO: 'memo ratio', CHECK: 'check',
};

export default async function StatementsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const s = await requirePermission('VIEW_STATEMENTS');
  const t = messages(s.locale);
  const ts = t.statements;
  const p = parseParams(await searchParams);
  const { period, periods } = await resolvePeriod(p.period);
  if (!period) return <p className="muted">{t.dashboard.noData}</p>;
  const params = { ...p, period: period.key };

  const { columns, canConsolidate, monthView, data, rows } = await statementView(s, params, period.key);
  const reasons = preliminaryReasons(data.inputs, t);
  const pct = new Intl.NumberFormat(s.locale === 'es' ? 'es-US' : 'en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const tab = (label: string, extra: Record<string, string>, active: boolean) =>
    <a href={`/statements?${query(params, extra)}`} className={`tab${active ? ' active' : ''}`}>{label}</a>;

  const cell = (r: ViewRow, i: number, col: string) => {
    const v = r.values[i] ?? null;
    if (r.kind === 'MEMO_HEADER') return <td key={col} />;
    if (r.kind === 'RATIO') return <td key={col} className="num">{v === null ? '–' : pct.format(v.toNumber())}</td>;
    if (r.kind === 'CHECK')
      return <td key={col} className={`num${v && v.abs().gte('0.005') ? ' bad' : ''}`}>{formatMoney(v ?? 0, s.locale, 2)}</td>;
    const text = !v || v.isZero() ? '–' : formatMoney(v, s.locale);
    return (
      <td key={col} className="num">
        {r.lineCode ? <a href={`/statements/line?${query(params, { line: r.lineCode, entity: col })}`}>{text}</a> : text}
      </td>
    );
  };

  return (
    <>
      <div className="top" style={{ alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>{ts.title}</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>{ts.ytdNote}</p>
        </div>
        <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a className="button" href={`/statements/export?${query(params)}`} download>{ts.download}</a>
          <span className={`pill ${data.inputs.isFinal ? 'final' : 'preliminary'}`} title={ts.preliminaryWhy}>
            {data.inputs.isFinal ? ts.final : ts.preliminary}
          </span>
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
            {rows.map(r => (
              <tr key={r.key} className={ROW_CLASS[r.kind]}>
                <td colSpan={r.kind === 'MEMO_HEADER' ? 1 : undefined}>{r.label}</td>
                {columns.map((c, i) => cell(r, i, c))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p.stmt === 'PL' && (
        <p className="muted" style={{ fontSize: 13 }}>
          {ts.ebitdaDefinition}: {s.locale === 'es' ? EBITDA_DEFINITION.sourceEs : EBITDA_DEFINITION.sourceEn}.
        </p>
      )}
      <p className="muted" style={{ fontSize: 13 }}>{ts.drillHint}</p>
    </>
  );
}
