// Differences traced to formula errors in the Databook itself, not the portal. Each entry is exact: if the Databook
// is corrected (or changes), the difference disappears or moves, and the acceptance check fails until this list is updated.

export type KnownError = { source: string; entity: string; period: string; lineCode: string; diff: string; why: string };

export const KNOWN_DATABOOK_ERRORS: readonly KnownError[] = [
  { source: 'PL (YE)', entity: 'GSA', period: '2025-12', lineCode: 'PL.EBITDA', diff: '-37829.64',
    why: "'PL (YE)'!G52 subtracts interest (=-G44) instead of adding it back" },
  { source: 'PL (YE)', entity: 'ELIM', period: '2025-12', lineCode: 'PL.EBITDA', diff: '37857.28',
    why: "'PL (YE)'!I52 subtracts interest (=-I44) instead of adding it back" },
];

export const knownErrorKey = (d: { source: string; entity: string; period: string; lineCode: string; diff: string }) =>
  `${d.source} ${d.entity} ${d.period} ${d.lineCode}: portal − databook ${d.diff}`;
