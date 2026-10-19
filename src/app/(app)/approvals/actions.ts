'use server';
// Server actions for approvals. The session is read here, and every rule is enforced in src/lib/approvals.ts.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { approveTb, approveTbs, decideMappings, rejectTb, submissionImbalances, TB_TOLERANCE } from '@/lib/approvals';

const back = (requested: string, msg: Record<string, string | number>) => {
  revalidatePath('/', 'layout');
  // The return path comes from the form: only ever go back inside the approvals screens.
  const path = /^\/approvals(\/mappings)?(\?[\w=&%.-]*)?$/.test(requested) ? requested : '/approvals';
  const q = new URLSearchParams(Object.entries(msg).map(([k, v]) => [k, String(v)]));
  redirect(`${path}${path.includes('?') ? '&' : '?'}${q}`);
};
const str = (f: FormData, k: string) => (typeof f.get(k) === 'string' ? (f.get(k) as string) : '');

export async function approveTbAction(form: FormData) {
  const s = await requireSession();
  const r = await approveTb(db, s, str(form, 'id'), str(form, 'note'));
  back(str(form, 'return') || '/approvals', r.ok ? { ok: 1 } : { refused: r.refusal });
}

export async function rejectTbAction(form: FormData) {
  const s = await requireSession();
  const r = await rejectTb(db, s, str(form, 'id'), str(form, 'reason'));
  back(str(form, 'return') || '/approvals', r.ok ? { rejected: 1 } : { refused: r.refusal });
}

/** Approve every listed TB that balances; out-of-balance ones need an individual note, so they are left for that. */
export async function approveAllTbsAction(form: FormData) {
  const s = await requireSession();
  const ids = form.getAll('ids').filter((x): x is string => typeof x === 'string');
  const imb = await submissionImbalances(db, ids);
  const balanced = ids.filter(id => imb.get(id)!.abs().lte(TB_TOLERANCE));
  const r = await approveTbs(db, s, balanced);
  const refused = Object.values(r.refused).reduce((a, b) => a + b, 0) + (ids.length - balanced.length);
  back(str(form, 'return') || '/approvals', { ok: r.approved, notOk: refused });
}

export async function decideMappingsAction(form: FormData) {
  const s = await requireSession();
  const decision = str(form, 'decision') === 'reject' ? 'REJECTED' : 'APPROVED';
  const ids = form.getAll('ids').filter((x): x is string => typeof x === 'string');
  const r = await decideMappings(db, s, ids, decision, str(form, 'reason'));
  const ret = str(form, 'return') || '/approvals';
  if ('refusal' in r) back(ret, { refused: r.refusal });
  else if (decision === 'REJECTED') back(ret, { rejected: r.approved, notOk: r.refused.NOT_ELIGIBLE ?? 0 });
  else back(ret, { ok: r.approved, notOk: r.refused.NOT_ELIGIBLE ?? 0 });
}
