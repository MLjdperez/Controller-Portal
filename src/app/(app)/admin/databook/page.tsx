import { requirePagePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatDate, messages } from '@/lib/i18n';
import { AdminTabs } from '../admin-tabs';
import { uploadDatabookAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function DatabookPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await requirePagePermission('ADMIN_COA');
  const t = messages(s.locale);
  const td = t.databook;
  const { error } = await searchParams;
  const batches = await db.importBatch.findMany({
    where: { kind: 'DATABOOK' }, orderBy: { createdAt: 'desc' }, take: 10,
    include: { uploadedBy: { select: { fullName: true } } },
  });

  return (
    <>
      <AdminTabs s={s} t={t} active="databook" />
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{td.title}</h2>
      <p className="muted" style={{ marginTop: 0, maxWidth: 820 }}>{td.intro}</p>
      {error && <p className="notice error-notice" role="alert">{td.errors[error] ?? error}</p>}

      <form action={uploadDatabookAction} className="card" style={{ maxWidth: 640 }}>
        <label htmlFor="file" style={{ marginTop: 0 }}>{td.file}</label>
        <input id="file" name="file" type="file" accept=".xlsx" required />
        <div><button type="submit">{td.send}</button></div>
      </form>

      <h3>{td.recent}</h3>
      {batches.length === 0 ? <p className="muted">–</p> : (
        <table>
          <thead><tr><th>{t.tb.file.split(' (')[0]}</th><th>{t.tb.status}</th><th>{t.tb.uploadedBy}</th><th>SHA-256</th><th /></tr></thead>
          <tbody>
            {batches.map(b => (
              <tr key={b.id}>
                <td>{b.fileName}</td>
                <td><span className={`pill ${b.status === 'COMMITTED' ? 'final' : b.status === 'VALIDATED' ? 'preliminary' : 'missing'}`}>{b.status}</span></td>
                <td>{b.uploadedBy?.fullName ?? '–'} <span className="muted">{formatDate(b.createdAt, s.locale)}</span></td>
                <td className="muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{b.sha256.slice(0, 12)}…</td>
                <td><a href={`/admin/databook/${b.id}`}>{t.tb.open} →</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
