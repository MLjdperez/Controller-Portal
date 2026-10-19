import type { PeriodStatus, SubmissionStatus } from '@prisma/client';

// Labels only. Data keeps stable codes; these catalogs translate them.
export const en = {
  app: { name: 'Controller Portal', group: 'Mama Lycha Group' },
  nav: {
    dashboard: 'Executive Dashboard',
    statements: 'Financial Statements',
    trialBalances: 'Entities & Trial Balances',
    consolidation: 'Consolidation & Intercompany',
    journalEntries: 'Journal Entries',
    close: 'Month-End Close',
    fixedAssets: 'Fixed Assets',
    intangibles: 'Intangible Assets',
    leases: 'Lease Accounting',
    accruals: 'Accrual Management',
    tax: 'Tax Management',
    audit: 'Audit & PBC Requests',
    messages: 'Messages & Requests',
    reports: 'Reports & Reconciliations',
    admin: 'Administration & Policies',
    phase: (n: number) => `Phase ${n}`,
  },
  auth: {
    signIn: 'Sign in', signOut: 'Sign out', email: 'Email', password: 'Password',
    invalid: 'Email or password is incorrect.',
    locked: 'Too many attempts. Try again in 15 minutes.',
    inactive: 'This account is deactivated.',
  },
  dashboard: {
    period: 'Period', entity: 'Entity', tbStatus: 'Trial balance',
    missing: 'Missing', preliminary: 'Preliminary', final: 'Final',
    noData: 'No trial balances loaded yet. Figures appear once the Databook import runs.',
  },
  submissionStatus: {
    DRAFT: 'Draft', VALIDATED: 'Validated', APPROVED: 'Approved', REJECTED: 'Rejected', SUPERSEDED: 'Superseded',
  } satisfies Record<SubmissionStatus, string>,
  periodStatus: { OPEN: 'Open', LOCKED: 'Locked' } satisfies Record<PeriodStatus, string>,
  language: { label: 'Language', en: 'English', es: 'Español' },
};

export type Messages = typeof en;
