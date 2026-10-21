// Phase 1 acceptance (handoff §6): portal statements reproduce the Databook BS and PL.
// Needs the real Databook, which never enters the repo:
//   DATABOOK_PATH="…/MLF Group Trial Balances 2026 (Databook Post Audit).xlsx" npm test
// Without it the suite is skipped, not passed.

import { beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseDatabook, type ParsedDatabook } from '@/lib/databook/parse';
import { readBaseline, type BaselineValue } from '@/lib/databook/baseline';
import { balancesFromParsed, compareToBaseline } from '@/lib/databook/compare';
import { computeStatements, CONSOLIDATED } from '@/lib/statements/engine';
import { cents } from '@/lib/money';
import { checkOpenings } from '@/lib/databook/openings';
import { KNOWN_DATABOOK_ERRORS, knownErrorKey } from '@/lib/databook/known-errors';

const path = process.env.DATABOOK_PATH;
const ENTITIES = ['MLB', 'MLF', 'MLL', 'GSA', 'LSA', 'ELIM'];

describe.skipIf(!path)('Databook acceptance', () => {
  let parsed: ParsedDatabook;
  let baseline: BaselineValue[];

  beforeAll(async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path!);
    parsed = parseDatabook(wb, { through: '2026-09' });
    baseline = readBaseline(wb);
  }, 120_000);

  it('parses every entity tab with no errors', () => {
    const errors = parsed.issues.filter(i => i.severity === 'ERROR');
    expect(errors).toEqual([]);
    expect(parsed.entities.map(e => e.entity)).toEqual(ENTITIES);
    expect(parsed.periods[0]).toBe('2024-12');
    expect(parsed.periods.at(-1)).toBe('2026-09');
  });

  // The monthly BS/PL tabs show whichever entity their B5 selector names: MLF in the 2026-10-14 file, "*" (the
  // consolidated group) in the 2026-10-21 corrected one.
  const monthlyEntity = () => baseline.find(b => b.source === 'BS')?.entity;

  it('reads a baseline for the selected entity every month and every entity at Dec-2025', () => {
    expect(['MLF', CONSOLIDATED]).toContain(monthlyEntity());
    expect(baseline.filter(b => b.source === 'BS' && b.period === '2026-09').length).toBeGreaterThan(20);
    for (const e of ENTITIES) expect(baseline.some(b => b.source === 'BS (YE)' && b.entity === e)).toBe(true);
  });

  it('compares EBITDA to the Databook "EBITDA, reported" (monthly selection, every entity at YE)', () => {
    const e = baseline.filter(b => b.lineCode === 'PL.EBITDA');
    expect(e.some(b => b.source === 'PL' && b.entity === monthlyEntity() && b.period === '2026-09')).toBe(true);
    expect(e.filter(b => b.source === 'PL (YE)').map(b => b.entity).sort()).toEqual([...ENTITIES].sort());
  });

  it('reproduces the Databook statements to the cent, except its known formula errors', () => {
    const { compared, differences } = compareToBaseline(baseline, p => balancesFromParsed(parsed, p), ENTITIES);
    expect(compared).toBeGreaterThan(1000);
    // Only the Databook's own traced formula errors may differ, each by exactly its recorded amount.
    const known = new Set(KNOWN_DATABOOK_ERRORS.map(knownErrorKey));
    expect(differences.map(d => knownErrorKey({ ...d, diff: cents(d.diff) })).filter(k => !known.has(k))).toEqual([]);
  });

  it('reports every opening balance that does not roll forward (printed for the Controller)', () => {
    const diffs = checkOpenings(parsed);
    console.table(diffs.map(d => ({ entity: d.entity, year: d.year, line: d.lineCode,
      rolledForward: cents(d.expected), databookOpening: cents(d.actual), diff: cents(d.diff) })));
    // Since the 2026-10-21 corrections, openings roll forward except cents of rounding (LSA's openings were keyed in whole dollars).
    expect(diffs.filter(d => d.diff.abs().gt(2)).map(d => `${d.entity} ${d.year} ${d.lineCode} ${cents(d.diff)}`)).toEqual([]);
  });

  it('consolidated Sep-2026 = sum of the six entities, and reports the BS difference', () => {
    const st = computeStatements(balancesFromParsed(parsed, '2026-09'), ENTITIES);
    const ni = st.amounts.get('PL.NET_INCOME')!;
    expect(cents(ni.get(CONSOLIDATED)!)).toBe(cents(ENTITIES.reduce((t, e) => t.plus(ni.get(e)!), ni.get('MLB')!.minus(ni.get('MLB')!))));
    // Assets + L&E is 0 when the BS balances; whatever it is, it must equal the TB's own difference (no mapping leaks).
    for (const e of [...ENTITIES, CONSOLIDATED])
      expect(cents(st.checks.bsDifference.get(e)!)).toBe(cents(st.checks.tbDifference.get(e)!));
  });
});
