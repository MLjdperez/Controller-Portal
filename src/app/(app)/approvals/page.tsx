import { requirePagePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatDate, formatMoney, messages } from '@/lib/i18n';
import { submissionImbalances, TB_TOLERANCE } from '@/lib/approvals';
import { approveAllTbsAction, approveTbAction, rejectTbAction } from './actions';
import { Flash } from './flash';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requirePagePermission();
  const t = messages(s.locale);
  const ta = t.approvals;
  const sp = await searchParams;
  const periodKey = typeof sp.period === 'string' && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : '';

  const canTb = s.permissions.has('APPROVE_TB');
  const canMap = s.permissions.has('APPROVE_MAPPING');

  const subs = canTb ? await db.tbSubmission.findMany({
    where: { status: 'VALIDATED', entityId: { in: s.entityIds }, ...(periodKey ? { period: { key: periodKey } } : {}) },
    include: { entity: true, period: true, preparedBy: { select: { fullName: true } }, _count: { select: { lines: true } } },
    orderBy: [{ period: { key: 'desc' } }, { entity: { sortOrder: 'asc' } }],
  }) : [];
  const imb = await submissionImbalances(db, subs.map(x => x.id));
  const periods = canTb ? await db.accountingPeriod.findMany({
    where: { submissions: { some: { status: 'VALIDATED', entityId: { in: s.entityIds } } } }, orderBy: { key: 'desc' } }) : [];

  const mapCounts = canMap ? await db.accountMapping.groupBy({
    by: ['sourceAccountId'], where: { status: 'PROPOSED', sourceAccount: { entityId: { in: s.entityIds } } }, _count: true,
  }) : [];
  const mapByEntity = canMap ? await db.entity.findMany({
    where: { id: { in: s.entityIds } }, orderBy: { sortOrder: 'asc' },
    select: { code: true, legalName: true, _count: { select: { sourceAccounts: { where: { mappings: { some: { status: 'PROPOSED' } } } } } } },
  }) : [];
  const returnTo = `/approvals${periodKey ? `?period=${periodKey}` : ''}`;
  const balancedIds = subs.filter(x => imb.get(x.id)!.abs().lte(TB_TOLERANCE) && x.preparedById !== s.id).map(x => x.id);

  return (
    <>
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{ta.title}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{ta.intro}</p>
      <Flash sp={sp} t={ta} />

      {canTb && (
        <section>
          <div className="top">
            <h3 style={{ margin: 0 }}>{ta.tbTitle} <span className="pill">{subs.length}</span></h3>
            <form method="get" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select name="period" defaultValue={periodKey}>
                <option value="">{ta.allPeriods}</option>
                {periods.map(p => <option key={p.id} value={p.key}>{p.key}</option>)}
              </select>
              <button type="submit" style={{ marginTop: 0 }}>OK</button>
            </form>
          </div>
          {subs.length === 0 ? <p className="muted">{ta.none}</p> : (
            <>
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t.statements.period}</th><th>{t.statements.entity}</th><th>{t.statements.version}</th>
                      <th>{ta.preparedBy}</th><th className="num">{ta.lines}</th><th className="num">{ta.balanceCheck}</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map(x => {
                      const d = imb.get(x.id)!;
                      const off = d.abs().gt(TB_TOLERANCE);
                      const mine = x.preparedById === s.id;
                      return (
                        <tr key={x.id}>
                          <td>{x.period.key}</td>
                          <td>{x.entity.code}</td>
                          <td>v{x.version}</td>
                          <td>{x.preparedBy?.fullName ?? '–'} <span className="muted">{formatDate(x.createdAt, s.locale)}</span></td>
                          <td className="num">{x._count.lines}</td>
                          <td className={`num${off ? ' bad' : ''}`}>{off ? formatMoney(d, s.locale, 2) : ta.balanced}</td>
                          <td>
                            {mine ? <span className="muted">{ta.yours}</span> : (
                              <div className="actions">
                                <form action={approveTbAction}>
                                  <input type="hidden" name="id" value={x.id} />
                                  <input type="hidden" name="return" value={returnTo} />
                                  {off && <input name="note" placeholder={ta.note} required minLength={10} />}
                                  <button type="submit">{ta.approve}</button>
                                </form>
                                <form action={rejectTbAction}>
                                  <input type="hidden" name="id" value={x.id} />
                                  <input type="hidden" name="return" value={returnTo} />
                                  <input name="reason" placeholder={ta.reason} required minLength={10} />
                                  <button type="submit" className="secondary">{ta.reject}</button>
                                </form>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {balancedIds.length > 0 && (
                <form action={approveAllTbsAction} className="bulk">
                  {balancedIds.map(id => <input key={id} type="hidden" name="ids" value={id} />)}
                  <input type="hidden" name="return" value={returnTo} />
                  <button type="submit">{ta.approveAll(balancedIds.length)}</button>
                  <span className="muted">{ta.bulkSkipsImbalanced}</span>
                </form>
              )}
            </>
          )}
        </section>
      )}

      {canMap && (
        <section style={{ marginTop: 32 }}>
          <h3>{ta.mapTitle} <span className="pill">{mapCounts.length}</span></h3>
          {mapCounts.length === 0 ? <p className="muted">{ta.none}</p> : (
            <table>
              <thead><tr><th>{t.statements.entity}</th><th className="num">{ta.pending}</th><th /></tr></thead>
              <tbody>
                {mapByEntity.filter(e => e._count.sourceAccounts > 0).map(e => (
                  <tr key={e.code}>
                    <td>{e.code} — {e.legalName}</td>
                    <td className="num">{e._count.sourceAccounts}</td>
                    <td><a href={`/approvals/mappings?entity=${e.code}`}>{ta.review} →</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      {!canTb && !canMap && <p className="muted">{ta.refusals.FORBIDDEN}</p>}
    </>
  );
}
