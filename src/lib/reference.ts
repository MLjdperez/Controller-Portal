// Group reference data: one place for the seed, the importer and the tests to agree on.
// Source: master prompt §4, handoff §0 (D3 ownership, D4 currency, Lunic = Nicaragua).

import type { EntityKind, Permission, RoleCode, SourceSystem } from '@prisma/client';

export type EntityDef = {
  code: string;
  legalName: string;
  shortName: string;
  /** The Databook's "Entity" column value for this company. */
  databookName: string;
  kind: EntityKind;
  country: string;
  functionalCurrency: string;
  sourceSystem: SourceSystem;
  sageCompanyCode?: string;
  parent?: string;
  sortOrder: number;
};

export const ENTITIES: readonly EntityDef[] = [
  { code: 'MLB', legalName: 'ML Buyer', shortName: 'ML Buyer', databookName: 'ML Buyer',
    kind: 'LEGAL', country: 'US', functionalCurrency: 'USD', sourceSystem: 'PORTAL', sortOrder: 10 },
  { code: 'MLF', legalName: 'Mama Lycha Foods, LLC', shortName: 'Mama Lycha Foods', databookName: 'Mama Lycha',
    kind: 'LEGAL', country: 'US', functionalCurrency: 'USD', sourceSystem: 'SAGE100', sageCompanyCode: 'MAM',
    parent: 'MLB', sortOrder: 20 },
  { code: 'MLL', legalName: 'Mama Lycha Logistics, LLC', shortName: 'Mama Lycha Logistics', databookName: 'Logistics',
    kind: 'LEGAL', country: 'US', functionalCurrency: 'USD', sourceSystem: 'QUICKBOOKS', parent: 'MLF', sortOrder: 30 },
  { code: 'GSA', legalName: 'Gotera S.A. de C.V.', shortName: 'Gotera', databookName: 'Gotera',
    kind: 'LEGAL', country: 'SV', functionalCurrency: 'USD', sourceSystem: 'EXCEL_TB', parent: 'MLF', sortOrder: 40 },
  { code: 'LSA', legalName: 'Lunic SA', shortName: 'Lunic', databookName: 'Lunic',
    kind: 'LEGAL', country: 'NI', functionalCurrency: 'NIO', sourceSystem: 'EXCEL_TB', parent: 'MLF', sortOrder: 50 },
  { code: 'ELIM', legalName: 'Elimination Company', shortName: 'Eliminations', databookName: 'Elim',
    kind: 'CONSOLIDATION', country: 'US', functionalCurrency: 'USD', sourceSystem: 'PORTAL', sortOrder: 90 },
];

/** Every subsidiary 100% owned (Controller decision D3, 2026-10-19). */
export const OWNERSHIP: readonly { parent: string; child: string; percent: string }[] = [
  { parent: 'MLB', child: 'MLF', percent: '100' },
  { parent: 'MLF', child: 'MLL', percent: '100' },
  { parent: 'MLF', child: 'GSA', percent: '100' },
  { parent: 'MLF', child: 'LSA', percent: '100' },
];
export const OWNERSHIP_EFFECTIVE_FROM = '2024-12-31';
export const OWNERSHIP_BASIS = 'Controller decision D3, 2026-10-19 (handoff §0)';

export const ROLES: Record<RoleCode, { nameEn: string; nameEs: string; permissions: Permission[] }> = {
  CONTROLLER: {
    nameEn: 'Controller', nameEs: 'Contralor',
    permissions: ['ADMIN_USERS', 'ADMIN_ENTITIES', 'ADMIN_COA', 'APPROVE_MAPPING', 'VIEW_STATEMENTS',
      'VIEW_TB', 'UPLOAD_TB', 'APPROVE_TB', 'VIEW_AUDIT_LOG', 'LOCK_PERIOD'],
  },
  CFO: {
    nameEn: 'CFO', nameEs: 'Director financiero',
    permissions: ['ADMIN_USERS', 'APPROVE_MAPPING', 'VIEW_STATEMENTS', 'VIEW_TB', 'APPROVE_TB',
      'VIEW_AUDIT_LOG', 'LOCK_PERIOD'],
  },
  COLLABORATOR: {
    nameEn: 'Accounting collaborator', nameEs: 'Colaborador contable',
    permissions: ['VIEW_STATEMENTS', 'VIEW_TB', 'UPLOAD_TB'],
  },
  AUDITOR: {
    nameEn: 'External auditor', nameEs: 'Auditor externo',
    permissions: ['VIEW_STATEMENTS', 'VIEW_TB'],
  },
};

/** Periods the Databook carries: Dec-2024 (audited) through Dec-2026. */
export function periodKeys(): { fiscalYear: number; month: number; key: string }[] {
  const out = [{ fiscalYear: 2024, month: 12, key: '2024-12' }];
  for (const y of [2025, 2026])
    for (let m = 1; m <= 12; m++) out.push({ fiscalYear: y, month: m, key: `${y}-${String(m).padStart(2, '0')}` });
  return out;
}
