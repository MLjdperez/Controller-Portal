import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { messages } from '@/lib/i18n';
import { ALL_LINES } from '@/lib/statements/layout';
import { decideMappingsAction } from '../actions';
import { Flash } from '../flash';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

/** Proposed mappings for one entity, grouped by statement line, with select / approve all / reject. */
export default async function MappingApprovals({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requirePagePermission('APPROVE_MAPPING');
  const t = messages(s.locale);
  const ta = t.approvals;
  const sp = await searchParams;
  const code = typeof sp.entity === 'string' ? sp.entity : '';
  const line = typeof sp.line === 'string' ? sp.line : '';
  const entity = await db.entity.findUnique({ where: { code } });
  if (!entity || !s.entityIds.includes(entity.id)) notFound();

  const mappings = await db.accountMapping.findMany({
    where: { status: 'PROPOSED', sourceAccount: { entityId: entity.id },
      ...(line ? { stdAccount: { statementLine: { code: line } } } : {}) },
    include: {
      sourceAccount: true, preparedBy: { select: { fullName: true } },
      stdAccount: { include: { statementLine: true } },
    },
  });
  const order = (c: string) => ALL_LINES.findIndex(l => l.code === c);
  mappings.sort((a, b) => order(a.stdAccount.statementLine.code) - order(b.stdAccount.statementLine.code)
    || a.sourceAccount.code.localeCompare(b.sourceAccount.code));
  const lineCodes = [...new Set(mappings.map(m => m.stdAccount.statementLine.code))];
  const allLines = line ? [line] : lineCodes;
  const returnTo = `/approvals/mappings?entity=${entity.code}${line ? `&line=${encodeURIComponent(line)}` : ''}`;
  const lineName = (c: string) => { const l = ALL_LINES.find(x => x.code === c); return l ? (s.locale === 'es' ? l.nameEs : l.nameEn) : c; };
  const eligible = mappings.filter(m => m.preparedById && m.preparedById !== s.id);

  return (
    <>
      <p><a href="/approvals">← {ta.title}</a></p>
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{ta.mapTitle}: {entity.code}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{entity.legalName} · {mappings.length} {ta.pending.toLowerCase()}</p>
      <Flash sp={sp} t={ta} />

      <form method="get" className="controls">
        <input type="hidden" name="entity" value={entity.code} />
        <label>{ta.filterLine}
          <select name="line" defaultValue={line}>
            <option value="">{ta.all}</option>
            {[...new Set([...lineCodes, ...(line ? [line] : [])])].map(c => <option key={c} value={c}>{lineName(c)}</option>)}
          </select>
        </label>
        <button type="submit">OK</button>
      </form>

      {mappings.length === 0 ? <p className="muted">{ta.none}</p> : (
        <form action={decideMappingsAction}>
          <input type="hidden" name="return" value={returnTo} />
          <div className="bulk">
            <button type="submit" name="decision" value="approve">{ta.approveSelected}</button>
            <input name="reason" placeholder={ta.reason} minLength={10} />
            <button type="submit" name="decision" value="reject" className="secondary">{ta.rejectSelected}</button>
          </div>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>{t.statements.account}</th><th>{ta.mappedTo}</th><th>{ta.preparedBy}</th>
                </tr>
              </thead>
              <tbody>
                {allLines.map(lc => (
                  <LineRows key={lc} title={lineName(lc)}>
                    {mappings.filter(m => m.stdAccount.statementLine.code === lc).map(m => {
                      const mine = !m.preparedById || m.preparedById === s.id;
                      return (
                        <tr key={m.id}>
                          <td><input type="checkbox" name="ids" value={m.id} defaultChecked={!mine} disabled={mine} aria-label={m.sourceAccount.code} /></td>
                          <td>{m.sourceAccount.code} <span className="muted">{m.sourceAccount.nameEn ?? m.sourceAccount.nameSource}</span>
                            {m.sourceAccount.groupLabel ? <div className="muted" style={{ fontSize: 12 }}>L3: {m.sourceAccount.groupLabel}</div> : null}</td>
                          <td>{m.stdAccount.nameEn} <span className="muted">{m.stdAccount.code}</span></td>
                          <td>{mine ? <span className="muted">{ta.yours}</span> : m.preparedBy?.fullName ?? '–'}</td>
                        </tr>
                      );
                    })}
                  </LineRows>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>{eligible.length} / {mappings.length}</p>
        </form>
      )}
    </>
  );
}

function LineRows({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="subtotal"><td colSpan={4}>{title}</td></tr>
      {children}
    </>
  );
}
