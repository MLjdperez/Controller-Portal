// Approvals for trial balances and account mappings. Every rule is enforced here, on the server, inside the
// transaction that changes the record: permission, entity scope, status, segregation of duties, period lock,
// and a documented note for an out-of-balance TB. Informal messages never count as approval (master prompt §18).

import type { Permission, Prisma, PrismaClient } from '@prisma/client';
import { audit } from './audit-core';
import { canApprove } from './scope';
import { Decimal } from './money';

export type Approver = { id: string; permissions: Set<Permission>; entityIds: string[] };

export type Refusal =
  | 'FORBIDDEN' | 'OUT_OF_SCOPE' | 'NOT_FOUND' | 'WRONG_STATUS' | 'SELF_APPROVAL'
  | 'PERIOD_LOCKED' | 'NEEDS_NOTE' | 'NEEDS_REASON';

export type Outcome = { ok: true } | { ok: false; refusal: Refusal };

/** TB lines must net to zero within this before approval needs a documented exception. */
export const TB_TOLERANCE = new Decimal('0.005');
const MIN_TEXT = 10;

/** Pure rule check for one TB approval; the caller supplies the facts. */
export function checkTbApproval(f: {
  approver: Approver; entityId: string; status: string; preparedById: string | null;
  periodLocked: boolean; imbalance: Decimal; note: string | undefined;
}): Outcome {
  if (!f.approver.permissions.has('APPROVE_TB')) return { ok: false, refusal: 'FORBIDDEN' };
  if (!f.approver.entityIds.includes(f.entityId)) return { ok: false, refusal: 'OUT_OF_SCOPE' };
  if (f.status !== 'VALIDATED') return { ok: false, refusal: 'WRONG_STATUS' };
  if (!canApprove(f.preparedById, f.approver.id)) return { ok: false, refusal: 'SELF_APPROVAL' };
  if (f.periodLocked) return { ok: false, refusal: 'PERIOD_LOCKED' };
  if (f.imbalance.abs().gt(TB_TOLERANCE) && (f.note ?? '').trim().length < MIN_TEXT) return { ok: false, refusal: 'NEEDS_NOTE' };
  return { ok: true };
}

type Tx = Prisma.TransactionClient;

async function tbFacts(tx: Tx, id: string) {
  const sub = await tx.tbSubmission.findUnique({ where: { id }, include: { entity: true, period: true } });
  if (!sub) return null;
  const agg = await tx.tbLine.aggregate({ where: { submissionId: id }, _sum: { balance: true } });
  const ep = await tx.entityPeriod.findUnique({ where: { entityId_periodId: { entityId: sub.entityId, periodId: sub.periodId } } });
  return { sub, imbalance: new Decimal(agg._sum.balance?.toString() ?? '0'), locked: ep?.status === 'LOCKED' };
}

export async function approveTb(db: PrismaClient, approver: Approver, id: string, note?: string): Promise<Outcome> {
  return db.$transaction(async tx => {
    const f = await tbFacts(tx, id);
    if (!f) return { ok: false, refusal: 'NOT_FOUND' } as const;
    const check = checkTbApproval({ approver, entityId: f.sub.entityId, status: f.sub.status, preparedById: f.sub.preparedById,
      periodLocked: f.locked, imbalance: f.imbalance, note });
    if (!check.ok) return check;

    // One approved TB per entity and period: the previous approved version is superseded by this one.
    const prior = await tx.tbSubmission.findFirst({
      where: { entityId: f.sub.entityId, periodId: f.sub.periodId, status: 'APPROVED', id: { not: id } } });
    if (prior) await tx.tbSubmission.update({ where: { id: prior.id }, data: { status: 'SUPERSEDED' } });
    const trimmed = note?.trim() || null;
    await tx.tbSubmission.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: approver.id, approvedAt: new Date(), approvalNote: trimmed,
        ...(prior && !f.sub.supersedesId ? { supersedesId: prior.id } : {}) },
    });
    await audit(tx, {
      userId: approver.id, action: 'APPROVE', objectType: 'TbSubmission', objectId: id, entityId: f.sub.entityId,
      summary: `Approved ${f.sub.entity.code} ${f.sub.period.key} TB v${f.sub.version}` +
        (f.imbalance.abs().gt(TB_TOLERANCE) ? ` with exception: out of balance ${f.imbalance.toFixed(2)}` : '') +
        (prior ? `; superseded v${prior.version}` : ''),
      before: { status: f.sub.status }, after: { status: 'APPROVED', note: trimmed, imbalance: f.imbalance.toFixed(6) },
    });
    return { ok: true } as const;
  });
}

export async function rejectTb(db: PrismaClient, approver: Approver, id: string, reason: string): Promise<Outcome> {
  return db.$transaction(async tx => {
    const f = await tbFacts(tx, id);
    if (!f) return { ok: false, refusal: 'NOT_FOUND' } as const;
    if (!approver.permissions.has('APPROVE_TB')) return { ok: false, refusal: 'FORBIDDEN' } as const;
    if (!approver.entityIds.includes(f.sub.entityId)) return { ok: false, refusal: 'OUT_OF_SCOPE' } as const;
    if (f.sub.status !== 'VALIDATED') return { ok: false, refusal: 'WRONG_STATUS' } as const;
    if (reason.trim().length < MIN_TEXT) return { ok: false, refusal: 'NEEDS_REASON' } as const;
    await tx.tbSubmission.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: reason.trim() } });
    await audit(tx, {
      userId: approver.id, action: 'REJECT', objectType: 'TbSubmission', objectId: id, entityId: f.sub.entityId,
      summary: `Rejected ${f.sub.entity.code} ${f.sub.period.key} TB v${f.sub.version}: ${reason.trim()}`,
      before: { status: f.sub.status }, after: { status: 'REJECTED', reason: reason.trim() },
    });
    return { ok: true } as const;
  });
}

export type BulkResult = { approved: number; refused: Record<string, number> };

/** Approve many TBs; each is checked on its own, so one refusal never blocks or weakens the others. Notes are not bulk. */
export async function approveTbs(db: PrismaClient, approver: Approver, ids: string[]): Promise<BulkResult> {
  const out: BulkResult = { approved: 0, refused: {} };
  for (const id of ids) {
    const r = await approveTb(db, approver, id);
    if (r.ok) out.approved++;
    else out.refused[r.refusal] = (out.refused[r.refusal] ?? 0) + 1;
  }
  return out;
}

/**
 * Approve or reject proposed mappings in one statement per decision. The WHERE clause carries every rule
 * (status, scope, not the preparer), so a mapping that fails any of them is untouched and counted as refused.
 */
export async function decideMappings(db: PrismaClient, approver: Approver, ids: string[],
  decision: 'APPROVED' | 'REJECTED', reason?: string): Promise<BulkResult | { refusal: Refusal }> {
  if (!approver.permissions.has('APPROVE_MAPPING')) return { refusal: 'FORBIDDEN' };
  if (decision === 'REJECTED' && (reason ?? '').trim().length < MIN_TEXT) return { refusal: 'NEEDS_REASON' };
  const unique = [...new Set(ids)];
  return db.$transaction(async tx => {
    const eligible = await tx.accountMapping.findMany({
      where: { id: { in: unique }, status: 'PROPOSED', sourceAccount: { entityId: { in: approver.entityIds } },
        OR: [{ preparedById: null }, { preparedById: { not: approver.id } }] },
      select: { id: true, preparedById: true, sourceAccount: { select: { entityId: true, code: true } } },
    });
    // No recorded preparer means segregation can't be shown: refuse, like canApprove().
    const ok = eligible.filter(m => canApprove(m.preparedById, approver.id));
    const now = new Date();
    await tx.accountMapping.updateMany({
      where: { id: { in: ok.map(m => m.id) }, status: 'PROPOSED' },
      data: decision === 'APPROVED'
        ? { status: 'APPROVED', approvedById: approver.id, approvedAt: now }
        : { status: 'REJECTED', approvedById: approver.id, approvedAt: now, rejectionReason: reason!.trim() },
    });
    const byEntity = new Map<string, number>();
    for (const m of ok) byEntity.set(m.sourceAccount.entityId, (byEntity.get(m.sourceAccount.entityId) ?? 0) + 1);
    for (const [entityId, n] of byEntity)
      await audit(tx, {
        userId: approver.id, action: decision === 'APPROVED' ? 'APPROVE' : 'REJECT', objectType: 'AccountMapping', entityId,
        summary: `${decision === 'APPROVED' ? 'Approved' : 'Rejected'} ${n} account mappings${reason ? `: ${reason.trim()}` : ''}`,
        after: { ids: ok.filter(m => m.sourceAccount.entityId === entityId).map(m => m.id) },
      });
    const refusedCount = unique.length - ok.length;
    const refused: Record<string, number> = refusedCount ? { NOT_ELIGIBLE: refusedCount } : {};
    return { approved: ok.length, refused };
  });
}

/** Sum of a submission's lines (0 when balanced). Exposed for the approvals screen. */
export async function submissionImbalances(db: PrismaClient, ids: string[]): Promise<Map<string, Decimal>> {
  const rows = await db.tbLine.groupBy({ by: ['submissionId'], where: { submissionId: { in: ids } }, _sum: { balance: true } });
  return new Map(ids.map(id => [id, new Decimal(rows.find(r => r.submissionId === id)?._sum.balance?.toString() ?? '0')]));
}
