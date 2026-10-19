import { describe, expect, it } from 'vitest';
import { canApprove, reachableEntityIds } from '@/lib/scope';
import { ENTITIES, OWNERSHIP, ROLES } from '@/lib/reference';

// The real group tree, by code, so the tests read like the org chart.
const tree = ENTITIES.map(e => ({ id: e.code, parentId: e.parent ?? null }));
const sorted = (xs: string[]) => [...xs].sort();

describe('reachableEntityIds', () => {
  it('no grants means no entities, never all', () => {
    expect(reachableEntityIds([], tree)).toEqual([]);
  });

  it('a grant without descendants is that entity only (auditor on MLF does not see Lunic)', () => {
    expect(reachableEntityIds([{ entityId: 'MLF', includeDescendants: false }], tree)).toEqual(['MLF']);
  });

  it('a grant on MLB with descendants reaches the whole legal group, but not ELIM', () => {
    expect(sorted(reachableEntityIds([{ entityId: 'MLB', includeDescendants: true }], tree)))
      .toEqual(['GSA', 'LSA', 'MLB', 'MLF', 'MLL']);
  });

  it('a grant on MLF with descendants reaches its three subsidiaries', () => {
    expect(sorted(reachableEntityIds([{ entityId: 'MLF', includeDescendants: true }], tree)))
      .toEqual(['GSA', 'LSA', 'MLF', 'MLL']);
  });

  it('combines grants without duplicates', () => {
    expect(sorted(reachableEntityIds([
      { entityId: 'MLF', includeDescendants: true }, { entityId: 'GSA', includeDescendants: false },
    ], tree))).toEqual(['GSA', 'LSA', 'MLF', 'MLL']);
  });
});

describe('canApprove (segregation of duties)', () => {
  it('the preparer cannot approve their own record', () => {
    expect(canApprove('u1', 'u1')).toBe(false);
  });
  it('someone else can', () => {
    expect(canApprove('u1', 'u2')).toBe(true);
  });
  it('a record with no recorded preparer cannot be approved', () => {
    expect(canApprove(null, 'u2')).toBe(false);
  });
});

describe('reference data', () => {
  it('has the six master-prompt entities', () => {
    expect(ENTITIES.map(e => e.code)).toEqual(['MLB', 'MLF', 'MLL', 'GSA', 'LSA', 'ELIM']);
  });
  it('follows the ownership chain MLB → MLF → {MLL, GSA, LSA}, all 100%', () => {
    expect(OWNERSHIP.map(o => `${o.parent}>${o.child}:${o.percent}`))
      .toEqual(['MLB>MLF:100', 'MLF>MLL:100', 'MLF>GSA:100', 'MLF>LSA:100']);
    for (const e of ENTITIES.filter(e => e.parent)) expect(OWNERSHIP.some(o => o.child === e.code && o.parent === e.parent)).toBe(true);
  });
  it('LSA is the only non-USD entity (NIO, Nicaragua)', () => {
    expect(ENTITIES.filter(e => e.functionalCurrency !== 'USD').map(e => [e.code, e.functionalCurrency, e.country]))
      .toEqual([['LSA', 'NIO', 'NI']]);
  });
  it('external auditors cannot upload, approve or administer', () => {
    expect(ROLES.AUDITOR.permissions.every(p => p.startsWith('VIEW_'))).toBe(true);
  });
  it('collaborators cannot approve', () => {
    expect(ROLES.COLLABORATOR.permissions.some(p => p.startsWith('APPROVE_'))).toBe(false);
  });
});
