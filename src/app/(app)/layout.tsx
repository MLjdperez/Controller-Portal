import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { messages } from '@/lib/i18n';
import { logout, setLocale } from './actions';

export const dynamic = 'force-dynamic';

// Master prompt §23. Sections not built yet are shown disabled, labelled with their phase.
const NAV = [
  { key: 'dashboard', href: '/', phase: 1 },
  { key: 'statements', href: '/statements', phase: 1 },
  { key: 'trialBalances', phase: 1 },
  { key: 'consolidation', phase: 2 },
  { key: 'journalEntries', phase: 2 },
  { key: 'close', phase: 3 },
  { key: 'fixedAssets', phase: 4 },
  { key: 'intangibles', phase: 4 },
  { key: 'leases', phase: 4 },
  { key: 'accruals', phase: 4 },
  { key: 'tax', phase: 5 },
  { key: 'audit', phase: 5 },
  { key: 'messages', phase: 3 },
  { key: 'reports', phase: 2 },
  { key: 'admin', href: '/admin/users', phase: 1, permission: 'ADMIN_USERS' },
] as const;

/** What is waiting for this user to approve: other people's work only, within their entities. */
async function pendingApprovals(s: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  const notMine = { OR: [{ preparedById: null }, { preparedById: { not: s.id } }] };
  const [tb, maps] = await Promise.all([
    s.permissions.has('APPROVE_TB')
      ? db.tbSubmission.count({ where: { status: 'VALIDATED', entityId: { in: s.entityIds }, ...notMine } }) : 0,
    s.permissions.has('APPROVE_MAPPING')
      ? db.accountMapping.count({ where: { status: 'PROPOSED', sourceAccount: { entityId: { in: s.entityIds } }, ...notMine } }) : 0,
  ]);
  return tb + maps;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.mustChangePassword) redirect('/password');
  const t = messages(s.locale);
  const other = s.locale === 'es' ? 'en' : 'es';
  const canApprove = s.permissions.has('APPROVE_TB') || s.permissions.has('APPROVE_MAPPING');
  const pending = canApprove ? await pendingApprovals(s) : 0;
  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <h1>{t.app.name}</h1>
        {NAV.map(n => {
          if ('permission' in n && !s.permissions.has(n.permission)) return null;
          const item = 'href' in n
            ? <a key={n.key} href={n.href}>{t.nav[n.key]}</a>
            : <span key={n.key} aria-disabled="true">{t.nav[n.key]} <small>{t.nav.phase(n.phase)}</small></span>;
          return n.key !== 'dashboard' || !canApprove ? item : [
            item,
            <a key="approvals" href="/approvals">{t.approvals.nav} {pending > 0 && <span className="count">{pending}</span>}</a>,
          ];
        })}
      </nav>
      <div className="main">
        <div className="top">
          <span className="muted">{s.fullName} · <a href="/password">{t.password.title}</a></span>
          <span style={{ display: 'flex', gap: 16 }}>
            <form action={setLocale}>
              <input type="hidden" name="locale" value={other} />
              <button className="link" type="submit">{t.language[other]}</button>
            </form>
            <form action={logout}><button className="link" type="submit">{t.auth.signOut}</button></form>
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
