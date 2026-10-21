import type { SessionUser } from '@/lib/auth';
import type { Messages } from '@/messages/en';

/** Sub-navigation for Administration & Policies: each tab only for those who may use it. */
export function AdminTabs({ s, t, active }: { s: SessionUser; t: Messages; active: 'users' | 'databook' }) {
  const tabs = [
    ...(s.permissions.has('ADMIN_USERS') ? [{ key: 'users', href: '/admin/users', label: t.users.title }] : []),
    ...(s.permissions.has('ADMIN_COA') ? [{ key: 'databook', href: '/admin/databook', label: t.databook.tab }] : []),
  ];
  return (
    <div className="tabs" style={{ display: 'inline-flex', marginBottom: 16 }}>
      {tabs.map(x => <a key={x.key} href={x.href} className={`tab${x.key === active ? ' active' : ''}`}>{x.label}</a>)}
    </div>
  );
}
