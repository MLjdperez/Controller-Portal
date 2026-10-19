import { describe, expect, it } from 'vitest';
import type { Permission, RoleCode } from '@prisma/client';
import { checkTbApproval } from '@/lib/approvals';
import { checkCreate } from '@/lib/users';
import { amount } from '@/lib/money';
import { ROLES } from '@/lib/reference';

const user = (id: string, role: RoleCode, entityIds = ['MLF', 'GSA']) =>
  ({ id, roles: [role], permissions: new Set<Permission>(ROLES[role].permissions), entityIds });

const base = {
  approver: user('cfo', 'CFO'), entityId: 'MLF', status: 'VALIDATED', preparedById: 'controller',
  periodLocked: false, imbalance: amount(0), note: undefined as string | undefined,
};

describe('TB approval rules', () => {
  it('a different, permitted, in-scope approver can approve a balanced TB', () => {
    expect(checkTbApproval(base)).toEqual({ ok: true });
  });
  it('the preparer cannot approve their own TB', () => {
    expect(checkTbApproval({ ...base, approver: user('controller', 'CONTROLLER') })).toEqual({ ok: false, refusal: 'SELF_APPROVAL' });
  });
  it('a TB with no recorded preparer cannot be approved', () => {
    expect(checkTbApproval({ ...base, preparedById: null })).toEqual({ ok: false, refusal: 'SELF_APPROVAL' });
  });
  it('collaborators and auditors cannot approve', () => {
    expect(checkTbApproval({ ...base, approver: user('c', 'COLLABORATOR') }).ok).toBe(false);
    expect(checkTbApproval({ ...base, approver: user('a', 'AUDITOR') })).toEqual({ ok: false, refusal: 'FORBIDDEN' });
  });
  it('an entity outside the approver’s access is refused', () => {
    expect(checkTbApproval({ ...base, entityId: 'LSA' })).toEqual({ ok: false, refusal: 'OUT_OF_SCOPE' });
  });
  it('only VALIDATED submissions can be approved', () => {
    for (const status of ['DRAFT', 'APPROVED', 'REJECTED', 'SUPERSEDED'])
      expect(checkTbApproval({ ...base, status })).toEqual({ ok: false, refusal: 'WRONG_STATUS' });
  });
  it('a locked period refuses approval', () => {
    expect(checkTbApproval({ ...base, periodLocked: true })).toEqual({ ok: false, refusal: 'PERIOD_LOCKED' });
  });
  it('an out-of-balance TB needs a documented exception note', () => {
    const off = { ...base, imbalance: amount('0.96') };
    expect(checkTbApproval(off)).toEqual({ ok: false, refusal: 'NEEDS_NOTE' });
    expect(checkTbApproval({ ...off, note: 'short' })).toEqual({ ok: false, refusal: 'NEEDS_NOTE' });
    expect(checkTbApproval({ ...off, note: 'Sage Sep-26 posting out by 0.96; ticket opened' })).toEqual({ ok: true });
  });
  it('half a cent is balanced (rounding tolerance)', () => {
    expect(checkTbApproval({ ...base, imbalance: amount('0.004') })).toEqual({ ok: true });
  });
});

describe('user administration rules', () => {
  it('a CFO cannot create a Controller', () => {
    expect(checkCreate(user('cfo', 'CFO'), 'CONTROLLER', ['MLF'])).toMatchObject({ error: 'ROLE_NOT_ALLOWED' });
  });
  it('a Controller can', () => {
    expect(checkCreate(user('c', 'CONTROLLER'), 'CONTROLLER', ['MLF'])).toBeNull();
  });
  it('nobody grants access to entities outside their own', () => {
    expect(checkCreate(user('c', 'CONTROLLER', ['MLF']), 'AUDITOR', ['MLF', 'LSA'])).toMatchObject({ error: 'NO_ENTITY' });
  });
  it('a new user needs at least one entity', () => {
    expect(checkCreate(user('c', 'CONTROLLER'), 'AUDITOR', [])).toMatchObject({ error: 'NO_ENTITY' });
  });
  it('collaborators cannot administer users', () => {
    expect(checkCreate(user('x', 'COLLABORATOR'), 'AUDITOR', ['MLF'])).toMatchObject({ error: 'FORBIDDEN' });
  });
});
