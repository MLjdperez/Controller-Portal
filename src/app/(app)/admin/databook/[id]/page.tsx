import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatMoney, messages } from '@/lib/i18n';
import { checkDatabook, latestPeriodWithData, verifyAgainstDb, type ClassifiedDifference } from '@/lib/databook/check';
import { workbookFromStorage } from '@/lib/databook/upload';
import { ALL_LINES } from '@/lib/statements/layout';
import { CONSOLIDATED } from '@/lib/statements/engine';
import type { Locale } from '@prisma/client';
import { AdminTabs } from '../../admin-tabs';
import { importDatabookAction } from '../actions';

export const dynamic = 'force-dynamic';

type SP = { through?: string; imported?: string; error?: string };

export default async function DatabookCheckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await requirePagePermission('ADMIN_COA');
  const t = messages(s.locale);
  const td = t.databook, tc = td.check;
  const { id } = await params;
  const sp = await searchParams;
  const batch = await db.importBatch.findUnique({ where: { id }, include: { uploadedBy: { select: { fullName: true } }, issues: true } });
  if (!batch || batch.kind !== 'DATABOOK') notFound();

  const wb = await workbookFromStorage(batch.storageKey);
  const latest = latestPeriodWithData(wb);
  const through = sp.through && /^\d{4}-\d{2}$/.test(sp.through) ? sp.through : latest ?? '2026-09';
  const check = checkDatabook(wb, through);
  const periods = await db.accountingPeriod.findMany({ where: { key: { lte: latest ?? '9999-12' } }, orderBy: { key: 'desc' } });
  const after = batch.status === 'COMMITTED' ? await verifyAgainstDb(db, wb, through) : null;
  const money = (v: { toString(): string }) => formatMoney(v.toString(), s.locale, 2);
  const small = check.openings.every(o => o.diff.abs().lte(2));
  const maxBreak = check.bsBreaks.reduce<typeof check.bsBreaks[number]['diff'] | null>(
    (m, b) => (!m || b.diff.abs().gt(m.abs()) ? b.diff : m), null);
  const known = check.comparison.differences.length - check.comparison.unexplained;
  const ok = (good: boolean) => <span className={`pill ${good ? 'final' : 'preliminary'}`}>{good ? '✓' : '!'}</span>;
  const imported = sp.imported;

  return (
    <>
      <AdminTabs s={s} t={t} active="databook" />
      <p><a href="/admin/databook">← {td.title}</a></p>
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{tc.title}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{batch.fileName} · {batch.uploadedBy?.fullName} · SHA-256 {batch.sha256.slice(0, 12)}… · <span className="pill">{batch.status}</span></p>
      {imported === 'duplicate' && <p className="notice">{tc.duplicate}</p>}
      {imported && imported !== 'duplicate' && (() => { const [c, u] = imported.split('.').map(Number); return <p className="notice" role="status">{tc.imported(c ?? 0, u ?? 0)}</p>; })()}
      {sp.error && <p className="notice error-notice" role="alert">{td.errors[sp.error] ?? sp.error}</p>}

      <form method="get" className="controls">
        <label>{tc.through}
          <select name="through" defaultValue={through}>{periods.map(p => <option key={p.id} value={p.key}>{p.key}</option>)}</select>
        </label>
        <button type="submit" className="secondary">{tc.recheck}</button>
      </form>

      <table style={{ maxWidth: 900 }}>
        <tbody>
          <tr><td>{ok(!check.errors)}</td><th>{tc.parse}</th>
            <td>{tc.accounts}: {check.parsed.entities.map(e => `${e.entity} ${e.accounts.length}`).join(' · ')} · {check.parsed.periods[0]} → {check.parsed.periods.at(-1)} · {tc.errors}: {check.errors} · {tc.warnings}: {check.warnings}</td></tr>
          <tr><td>{ok(small)}</td><th>{tc.openings}</th>
            <td>{check.openings.length === 0 ? tc.openingsOk : small ? tc.openingsSmall(check.openings.length)
              : check.openings.filter(o => o.diff.abs().gt(2)).map(o => `${o.entity} ${o.year} ${lineName(o.lineCode, s.locale)} ${money(o.diff)}`).join(' · ')}</td></tr>
          <tr><td>{ok(!maxBreak || maxBreak.abs().lte(1))}</td><th>{tc.bs}</th>
            <td>{maxBreak ? tc.bsBreaks(check.bsBreaks.length, money(maxBreak)) : tc.bsOk}</td></tr>
          <tr><td>{ok(!check.comparison.unexplained && check.comparison.compared > 0)}</td><th>{tc.compare}</th>
            <td>{check.comparison.unexplained ? tc.compareBad(check.comparison.compared, check.comparison.unexplained)
              : known ? tc.compareKnown(check.comparison.compared, known) : tc.compareOk(check.comparison.compared)}</td></tr>
        </tbody>
      </table>

      {check.errors > 0 && (
        <ul className="issues">{check.parsed.issues.filter(i => i.severity === 'ERROR').slice(0, 30).map((i, n) =>
          <li key={n} className="bad"><strong>{i.code}</strong> {i.tab}!{i.row}: {i.message}</li>)}</ul>
      )}
      {check.comparison.differences.length > 0 && <Differences rows={check.comparison.differences} locale={s.locale} labels={tc} money={money} />}

      {batch.status === 'VALIDATED' && !check.errors && (
        <form action={importDatabookAction} className="card" style={{ marginTop: 24, maxWidth: 720 }}>
          <input type="hidden" name="batchId" value={batch.id} />
          <input type="hidden" name="through" value={through} />
          {check.comparison.unexplained > 0 && (
            <>
              <label htmlFor="ack" style={{ marginTop: 0 }}>{tc.acknowledge}</label>
              <textarea id="ack" name="acknowledgement" rows={2} minLength={10} required className="ask-box" />
            </>
          )}
          <div className="bulk"><button type="submit">{tc.import} ({tc.through.toLowerCase()} {through})</button><span className="muted">{tc.importing}</span></div>
        </form>
      )}

      {after && (
        <section className="card" style={{ marginTop: 24, maxWidth: 900 }}>
          <h3 style={{ marginTop: 0 }}>{tc.afterTitle}</h3>
          <p>{ok(!after.unexplained)} {after.unexplained ? tc.afterBad(after.unexplained)
            : after.differences.length ? tc.afterKnown(after.compared, after.periods, after.differences.length) : tc.afterOk(after.compared, after.periods)}</p>
          {after.gaps.length > 0 && <ul className="issues">{after.gaps.map(g => <li key={g}>{g}</li>)}</ul>}
          {after.unexplained > 0 && <Differences rows={after.differences.filter(d => !d.knownWhy)} locale={s.locale} labels={tc} money={money} />}
        </section>
      )}
    </>
  );
}

function lineName(code: string, locale: Locale) {
  const l = ALL_LINES.find(x => x.code === code);
  return l ? (locale === 'es' ? l.nameEs : l.nameEn) : code;
}

function Differences({ rows, locale, labels, money }: {
  rows: ClassifiedDifference[]; locale: Locale; labels: ReturnType<typeof messages>['databook']['check']; money: (v: { toString(): string }) => string;
}) {
  return (
    <div className="scroll" style={{ marginTop: 16 }}>
      <table>
        <thead><tr><th /><th>{labels.line}</th><th className="num">{labels.portal}</th><th className="num">{labels.databook}</th><th className="num">{labels.diff}</th></tr></thead>
        <tbody>
          {rows.slice(0, 50).map((d, i) => (
            <tr key={i}>
              <td><span className={`pill ${d.knownWhy ? 'preliminary' : 'missing'}`}>{d.knownWhy ? labels.known : labels.unexplained}</span></td>
              <td>{d.source} · {d.entity === CONSOLIDATED ? 'CONSOLIDATED' : d.entity} · {d.period} · {lineName(d.lineCode, locale)}
                {d.knownWhy && <div className="muted" style={{ fontSize: 12 }}>{d.knownWhy}</div>}</td>
              <td className="num">{money(d.portal)}</td><td className="num">{money(d.value)}</td><td className="num">{money(d.diff)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
