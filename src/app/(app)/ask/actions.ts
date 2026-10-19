'use server';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { ask, type AskResult } from '@/lib/ask/ask';
import { ENTITIES } from '@/lib/reference';

export type AskState = { question?: string; result?: AskResult };

export async function askAction(_: AskState, form: FormData): Promise<AskState> {
  const s = await requirePermission('VIEW_STATEMENTS');
  const question = String(form.get('question') ?? '');
  const rows = await db.entity.findMany({ where: { id: { in: s.entityIds } }, select: { code: true } });
  const allowed = new Set(rows.map(r => r.code));
  const entityCodes = ENTITIES.map(e => e.code).filter(c => allowed.has(c));
  const periods = await db.accountingPeriod.findMany({
    where: { submissions: { some: { status: { not: 'SUPERSEDED' } } } }, orderBy: { key: 'asc' }, select: { key: true } });
  const result = await ask(db, {
    userId: s.id, question,
    scope: { entityCodes, canConsolidate: entityCodes.length === ENTITIES.length },
    loadedPeriods: periods.map(p => p.key),
  });
  return { question, result };
}
