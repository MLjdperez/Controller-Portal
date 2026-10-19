import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { messages } from '@/lib/i18n';
import { LoginForm } from './form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  if (await getSession()) redirect('/');
  const t = messages('en');
  const { changed } = await searchParams;
  return (
    <main className="login card">
      <h1 style={{ fontSize: 18, margin: 0 }}>{t.app.name}</h1>
      <p className="muted" style={{ marginTop: 4 }}>{t.app.group}</p>
      {changed && <p className="notice" role="status">{t.password.done}</p>}
      <LoginForm t={t.auth} />
    </main>
  );
}
