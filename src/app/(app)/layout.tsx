import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { messages } from '@/lib/i18n';
import { logout, setLocale } from './actions';

export const dynamic = 'force-dynamic';

// Master prompt §23. Sections not built yet are shown disabled, labelled with their phase.
const NAV = [
  { key: 'dashboard', href: '/', phase: 1 },
  { key: 'statements', phase: 1 },
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
  { key: 'admin', phase: 1 },
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const t = messages(s.locale);
  const other = s.locale === 'es' ? 'en' : 'es';
  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <h1>{t.app.name}</h1>
        {NAV.map(n => 'href' in n
          ? <a key={n.key} href={n.href}>{t.nav[n.key]}</a>
          : <span key={n.key} aria-disabled="true">{t.nav[n.key]} <small>{t.nav.phase(n.phase)}</small></span>)}
      </nav>
      <div className="main">
        <div className="top">
          <span className="muted">{s.fullName}</span>
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
