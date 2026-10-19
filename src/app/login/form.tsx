'use client';
import { useActionState } from 'react';
import { login, type LoginState } from './actions';
import type { Messages } from '@/messages/en';

export function LoginForm({ t }: { t: Messages['auth'] }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const error = state.error === 'LOCKED' ? t.locked : state.error === 'INACTIVE' ? t.inactive : state.error ? t.invalid : null;
  return (
    <form action={action}>
      <label htmlFor="email">{t.email}</label>
      <input id="email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="password">{t.password}</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={pending}>{t.signIn}</button>
    </form>
  );
}
