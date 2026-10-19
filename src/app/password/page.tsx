import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { messages } from '@/lib/i18n';
import { PasswordForm } from './form';

export const dynamic = 'force-dynamic';

/** Outside the (app) layout on purpose: that layout sends users who must change their password here. */
export default async function PasswordPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  const t = messages(s.locale);
  return (
    <main className="login card">
      <h1 style={{ fontSize: 18, margin: 0 }}>{t.password.title}</h1>
      <p className="muted" style={{ marginTop: 4 }}>{s.mustChangePassword ? t.password.mustChange : s.email}</p>
      <PasswordForm t={t.password} />
      {!s.mustChangePassword && <p style={{ marginTop: 16 }}><a href="/">← {t.nav.dashboard}</a></p>}
    </main>
  );
}
