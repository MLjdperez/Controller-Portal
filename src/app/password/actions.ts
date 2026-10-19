'use server';
import { redirect } from 'next/navigation';
import { changePassword, requireSession, signOut } from '@/lib/auth';

export type PasswordState = { error?: 'WRONG_CURRENT' | 'TOO_SHORT' | 'MISMATCH' };

export async function changePasswordAction(_: PasswordState, form: FormData): Promise<PasswordState> {
  const s = await requireSession();
  const current = String(form.get('current') ?? '');
  const next = String(form.get('next') ?? '');
  if (next !== String(form.get('confirm') ?? '')) return { error: 'MISMATCH' };
  const r = await changePassword(s.id, current, next);
  if (!r.ok) return { error: r.reason };
  // Every session ended with the old password; clear this browser's cookie and sign in again.
  await signOut();
  redirect('/login?changed=1');
}
