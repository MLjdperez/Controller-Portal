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

  it('reads a baseline for MLF every month and every entity at Dec-2025', () => {
    const mlfSep = baseline.filter(b => b.entity === 'MLF' && b.period === '2026-09');
    expect(mlfSep.length).toBeGreaterThan(40);
    for (const e of ENTITIES) expect(baseline.some(b => b.entity === e && b.period === '2025-12')).toBe(true);
  });

  it('compares EBITDA to the Databook "EBITDA, reported" (MLF monthly, every entity at YE)', () => {
    const e = baseline.filter(b => b.lineCode === 'PL.EBITDA');
    expect(e.some(b => b.entity === 'MLF' && b.period === '2026-09')).toBe(true);
    expect(e.filter(b => b.period === '2025-12').map(b => b.entity).sort()).toEqual([...ENTITIES].sort().concat('MLF').sort());
  });

  it('reproduces the Databook statements to the cent, except its known formula errors', () => {
    const { compared, differences } = compareToBaseline(baseline, p => balancesFromParsed(parsed, p), ENTITIES);
    expect(compared).toBeGreaterThan(1000);
    // Only the Databook's own traced formula errors may differ, and exactly by their recorded amounts.
    expect(differences.map(d => knownErrorKey({ ...d, diff: cents(d.diff) })))
      .toEqual(KNOWN_DATABOOK_ERRORS.map(knownErrorKey));
  });

  it('reports every opening balance that does not roll forward (printed for the Controller)', () => {
    const diffs = checkOpenings(parsed);
    console.table(diffs.map(d => ({ entity: d.entity, year: d.year, line: d.lineCode,
      rolledForward: cents(d.expected), databookOpening: cents(d.actual), diff: cents(d.diff) })));
    // Known as of the 2026-10-14 Databook: MLF's 2025 opening retained earnings is 574.18 off Dec-24 closed out.
    expect(diffs.some(d => d.entity === 'MLF' && d.year === '2025' && cents(d.diff.abs()) === '574.18')).toBe(true);
  });

  it('consolidated Sep-2026 = sum of the six entities, and reports the BS difference', () => {
    const st = computeStatements(balancesFromParsed(parsed, '2026-09'), ENTITIES);
    const ni = st.amounts.get('PL.NET_INCOME')!;
    expect(cents(ni.get(CONSOLIDATED)!)).toBe(cents(ENTITIES.reduce((t, e) => t.plus(ni.get(e)!), ni.get('MLB')!.minus(ni.get('MLB')!))));
    // Assets + L&E is 0 when the BS balances. Recorded, not asserted to zero: the Databook itself shows 0.96 for MLF.
    for (const e of [...ENTITIES, CONSOLIDATED])
      expect(cents(st.checks.bsDifference.get(e)!)).toBe(cents(st.checks.tbDifference.get(e)!));
  });
});
