'use client';
import { useActionState } from 'react';
import { changePasswordAction, type PasswordState } from './actions';
import type { Messages } from '@/messages/en';

export function PasswordForm({ t }: { t: Messages['password'] }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});
  return (
    <form action={action}>
      <label htmlFor="current">{t.current}</label>
      <input id="current" name="current" type="password" autoComplete="current-password" required />
      <label htmlFor="next">{t.next}</label>
      <input id="next" name="next" type="password" autoComplete="new-password" minLength={12} required />
      <label htmlFor="confirm">{t.confirm}</label>
      <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      {state.error && <p className="error" role="alert">{t.errors[state.error]}</p>}
      <button type="submit" disabled={pending}>{t.save}</button>
    </form>
  );
}
