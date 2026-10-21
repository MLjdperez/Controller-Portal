// Differences traced to formula errors in the Databook itself, not the portal. Each entry is exact: if the Databook
// is corrected (or changes), the difference disappears or moves, and the acceptance check fails until this list is updated.

export type KnownError = { source: string; entity: string; period: string; lineCode: string; diff: string; why: string };

// None open. History: PL (YE) row 52 subtracted interest in the EBITDA reconciliation (GSA and ELIM, then every column);
// fixed in the Databook saved 2026-10-21 14:48 (=+D44 across D52:I52). Since then every compared figure ties.
export const KNOWN_DATABOOK_ERRORS: readonly KnownError[] = [];

export const knownErrorKey = (d: { source: string; entity: string; period: string; lineCode: string; diff: string }) =>
  `${d.source} ${d.entity} ${d.period} ${d.lineCode}: portal − databook ${d.diff}`;
