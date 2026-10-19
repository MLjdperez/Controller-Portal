import { requirePagePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatDate, messages } from '@/lib/i18n';
import { uploadAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function TrialBalancesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await requirePagePermission('VIEW_TB');
  const t = messages(s.locale);
  const tt = t.tb;
  const { error } = await searchParams;
  const canUpload = s.permissions.has('UPLOAD_TB');

  const entities = await db.entity.findMany({ where: { id: { in: s.entityIds } }, orderBy: { sortOrder: 'asc' } });
  const periods = await db.accountingPeriod.findMany({ orderBy: { key: 'desc' } });
  // Grid: the latest loaded period and the five before it, plus the next one.
  const latestLoaded = await db.tbSubmission.findFirst({ where: { entityId: { in: s.entityIds } }, orderBy: { period: { key: 'desc' } }, select: { period: { select: { key: true } } } });
  const idx = Math.max(0, periods.findIndex(p => p.key === latestLoaded?.period.key));
  const gridPeriods = periods.slice(Math.max(0, idx - 1), idx + 6).reverse();
  const subs = await db.tbSubmission.findMany({
    where: { entityId: { in: s.entityIds }, periodId: { in: gridPeriods.map(p => p.id) }, status: { not: 'SUPERSEDED' } },
    select: { entityId: true, periodId: true, version: true, status: true }, orderBy: { version: 'desc' },
  });
  const cell = (entityId: string, periodId: string) => subs.find(x => x.entityId === entityId && x.periodId === periodId);

  const batches = await db.importBatch.findMany({
    where: { kind: 'TRIAL_BALANCE', entityId: { in: s.entityIds } }, orderBy: { createdAt: 'desc' }, take: 15,
    include: { entity: { select: { code: true } }, period: { select: { key: true } }, uploadedBy: { select: { fullName: true } } },
  });
  const nextKey = periods[Math.max(0, idx - 1)]?.key;

  return (
    <>
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{tt.title}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{tt.intro}</p>
      {error && <p className="notice error-notice" role="alert">{tt.errors[error] ?? error}</p>}

      <h3>{tt.grid}</h3>
      <div className="scroll">
        <table>
          <thead><tr><th>{tt.entity}</th>{gridPeriods.map(p => <th key={p.id}>{p.key}</th>)}</tr></thead>
          <tbody>
            {entities.map(e => (
              <tr key={e.id}>
                <td>{e.code}</td>
                {gridPeriods.map(p => {
                  const c = cell(e.id, p.id);
                  return <td key={p.id}>{c
                    ? <span className={`pill ${c.status === 'APPROVED' ? 'final' : 'preliminary'}`}>{t.submissionStatus[c.status]} · v{c.version}</span>
                    : <span className="pill missing">{tt.missing}</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canUpload && (
        <form action={uploadAction} className="card" style={{ marginTop: 24, maxWidth: 640 }}>
          <h3 style={{ marginTop: 0 }}>{tt.upload}</h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <label>{tt.entity}
              <select name="entity" required>
                {entities.filter(e => e.kind === 'LEGAL').map(e => <option key={e.id} value={e.code}>{e.code} — {e.shortName}</option>)}
              </select>
            </label>
            <label>{tt.period}
              <select name="period" defaultValue={nextKey} required>
                {periods.map(p => <option key={p.id} value={p.key}>{p.key}</option>)}
              </select>
            </label>
          </div>
          <label htmlFor="file">{tt.file}</label>
          <input id="file" name="file" type="file" accept=".xlsx,.csv" required />
          <div><button type="submit">{tt.send}</button></div>
        </form>
      )}

      <h3>{tt.recent}</h3>
      {batches.length === 0 ? <p className="muted">–</p> : (
        <table>
          <thead><tr><th>{tt.file.split(' (')[0]}</th><th>{tt.entity}</th><th>{tt.period}</th><th>{tt.status}</th><th>{tt.uploadedBy}</th><th /></tr></thead>
          <tbody>
            {batches.map(b => (
              <tr key={b.id}>
                <td>{b.fileName}</td><td>{b.entity?.code}</td><td>{b.period?.key}</td>
                <td><span className={`pill ${b.status === 'COMMITTED' ? 'final' : b.status === 'VALIDATED' ? 'preliminary' : 'missing'}`}>{b.status}</span></td>
                <td>{b.uploadedBy?.fullName ?? '–'} <span className="muted">{formatDate(b.createdAt, s.locale)}</span></td>
                <td><a href={`/trial-balances/batches/${b.id}`}>{tt.open} →</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
