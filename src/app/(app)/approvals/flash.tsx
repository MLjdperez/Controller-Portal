import type { Messages } from '@/messages/en';

/** Result of the last approval action, carried in the redirect's query string. */
export function Flash({ sp, t }: { sp: Record<string, string | string[] | undefined>; t: Messages['approvals'] }) {
  const n = (k: string) => (typeof sp[k] === 'string' ? Number(sp[k]) || 0 : 0);
  const refusal = typeof sp.refused === 'string' ? sp.refused : '';
  const parts: string[] = [];
  if (sp.ok !== undefined || sp.notOk !== undefined) parts.push(t.result(n('ok'), n('notOk')));
  if (sp.rejected !== undefined) parts.push(t.rejected(n('rejected')));
  if (refusal) parts.push(t.refusals[refusal] ?? refusal);
  if (n('notOk') && !refusal) parts.push(t.refusals.NOT_ELIGIBLE!);
  if (!parts.length) return null;
  return <p className={`notice${refusal ? ' error-notice' : ''}`} role="status">{parts.join(' ')}</p>;
}
