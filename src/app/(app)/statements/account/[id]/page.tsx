import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatDate, formatMoney, messages } from '@/lib/i18n';
import { parseParams, query, type RawParams } from '../../params';

export const dynamic = 'force-dynamic';

/** One source account: its mapping history and every TB line it appears on, back to the original file. */
export default async function AccountDrill({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<RawParams>;
}) {
  const s = await requirePagePermission('VIEW_TB');
  const t = messages(s.locale);
  const ts = t.statements;
  const { id } = await params;
  const p = parseParams(await searchParams);

  const account = await db.sourceAccount.findUnique({
    where: { id },
    include: {
      entity: true,
      icCounterparty: { select: { code: true } },
      mappings: { orderBy: { effectiveFrom: 'desc' }, include: { stdAccount: { include: { statementLine: true } } } },
      tbLines: {
        include: { submission: { include: { period: true, batch: true } } },
        orderBy: [{ submission: { period: { key: 'desc' } } }, { submission: { version: 'desc' } }],
      },
    },
  });
  // Out-of-scope accounts look exactly like missing ones.
  if (!account || !s.entityIds.includes(account.entityId)) notFound();

  return (
    <>
      <p><a href={`/statements?${query(p)}`}>← {ts.back}</a></p>
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{account.entity.code} · {account.code}</h2>
      <p style={{ margin: 0 }}>{account.nameEn ?? account.nameSource}</p>
      <p className="muted" style={{ marginTop: 4 }}>
        {ts.nameSource}: {account.nameSource}
        {account.groupLabel ? ` · L3: ${account.groupLabel}` : ''}
        {account.isIntercompany ? ` · IC${account.icCounterparty ? ` → ${account.icCounterparty.code}` : ''}` : ''}
        {account.eliminationRefs.length ? ` · Ref ${account.eliminationRefs.join(', ')}` : ''}
      </p>
      {account.code.startsWith('~') && <p className="notice">{ts.portalCode}</p>}

      <h3>{ts.mappingHistory}</h3>
      <table>
        <thead><tr><th>{ts.effectiveFrom}</th><th>{ts.stdAccount}</th><th>{ts.line}</th><th>{ts.status}</th></tr></thead>
        <tbody>
          {account.mappings.map(m => (
            <tr key={m.id}>
              <td>{formatDate(m.effectiveFrom, s.locale)}</td>
              <td>{m.stdAccount.nameEn} <span className="muted">{m.stdAccount.code}</span></td>
              <td>{s.locale === 'es' ? (m.stdAccount.statementLine.nameEs ?? m.stdAccount.statementLine.nameEn) : m.stdAccount.statementLine.nameEn}</td>
              <td><span className={`pill ${m.status === 'APPROVED' ? 'final' : 'preliminary'}`}>{t.mappingStatus[m.status]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{ts.accountHistory}</h3>
      <p className="muted" style={{ marginTop: 0 }}>{ts.ytdNote}</p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>{ts.period}</th><th>{ts.version}</th><th>{ts.status}</th>
              <th className="num">{ts.debit}</th><th className="num">{ts.credit}</th><th className="num">{ts.balance}</th>
              <th>{ts.source}</th><th>{ts.imported}</th>
            </tr>
          </thead>
          <tbody>
            {account.tbLines.map(l => (
              <tr key={l.id} className={l.submission.period.key === p.period ? 'current' : ''}>
                <td>{l.submission.period.key}</td>
                <td>v{l.submission.version}</td>
                <td>{t.submissionStatus[l.submission.status]}</td>
                <td className="num">{formatMoney(l.debit.toString(), s.locale, 2)}</td>
                <td className="num">{formatMoney(l.credit.toString(), s.locale, 2)}</td>
                <td className="num">{formatMoney(l.balance.toString(), s.locale, 2)}</td>
                <td title={`SHA-256 ${l.submission.batch.sha256}`}>
                  {l.submission.batch.fileName}{l.rowNumber ? ` · ${account.entity.code === 'ELIM' ? 'Elim' : account.entity.code}!${l.rowNumber}` : ''}
                </td>
                <td>{formatDate(l.submission.batch.createdAt, s.locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
