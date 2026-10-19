import { requirePagePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { messages } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** Phase 1 dashboard: TB status by entity for one period. A missing TB says "missing", never 0. */
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const s = await requirePagePermission('VIEW_TB');
  const t = messages(s.locale);
  const { period: key } = await searchParams;

  const periods = await db.accountingPeriod.findMany({ orderBy: [{ fiscalYear: 'desc' }, { month: 'desc' }] });
  const period = periods.find(p => p.key === key) ?? periods.find(p => p.key === '2026-09') ?? periods[0];
  if (!period) return <p className="muted">{t.dashboard.noData}</p>;

  const entities = await db.entity.findMany({
    where: { id: { in: s.entityIds } },
    orderBy: { sortOrder: 'asc' },
    include: {
      submissions: {
        where: { periodId: period.id, status: { not: 'SUPERSEDED' } },
        orderBy: { version: 'desc' }, take: 1,
      },
    },
  });

  return (
    <>
      <form className="top" style={{ justifyContent: 'flex-start' }}>
        <label htmlFor="period" style={{ margin: 0 }}>{t.dashboard.period}</label>
        <select id="period" name="period" defaultValue={period.key}>
          {periods.map(p => <option key={p.id} value={p.key}>{p.key}</option>)}
        </select>
        <button type="submit" style={{ marginTop: 0 }}>OK</button>
      </form>
      <table>
        <thead><tr><th>{t.dashboard.entity}</th><th>{t.dashboard.tbStatus}</th></tr></thead>
        <tbody>
          {entities.map(e => {
            const sub = e.submissions[0];
            const cls = !sub ? 'missing' : sub.status === 'APPROVED' ? 'final' : 'preliminary';
            const label = !sub ? t.dashboard.missing : `${t.submissionStatus[sub.status]} · v${sub.version}`;
            return (
              <tr key={e.id}>
                <td>{e.code} — {e.legalName}</td>
                <td><span className={`pill ${cls}`}>{label}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
