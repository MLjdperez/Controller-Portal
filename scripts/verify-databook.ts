// End-to-end acceptance: statements built from the DATABASE equal the Databook's own statements.
//   npm run db:verify:databook -- "<path to .xlsx>"
// Exit code 1 on any difference over half a cent.

import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { readBaseline } from '../src/lib/databook/baseline';
import { compareToBaseline } from '../src/lib/databook/compare';
import { loadStatementInputs } from '../src/lib/statements/load';
import { computeStatements, CONSOLIDATED } from '../src/lib/statements/engine';
import type { MappedBalance } from '../src/lib/statements/engine';
import { cents } from '../src/lib/money';
import { KNOWN_DATABOOK_ERRORS, knownErrorKey } from '../src/lib/databook/known-errors';

const ENTITIES = ['MLB', 'MLF', 'MLL', 'GSA', 'LSA', 'ELIM'];

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: verify-databook <file.xlsx>');
  const db = new PrismaClient();
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path);
    const cache = new Map<string, MappedBalance[]>();
    const status: string[] = [];
    const notLoaded: string[] = [];
    const all = readBaseline(wb);
    for (const period of [...new Set(all.map(b => b.period))].sort()) {
      const inputs = await loadStatementInputs(db, { periodKey: period, entityCodes: ENTITIES, basis: 'LATEST' });
      const missing = inputs.entities.filter(e => !e.submission).map(e => e.entity);
      // A period nothing was loaded for is not evidence either way (the Databook's empty future months are zeros).
      if (missing.length === ENTITIES.length) { notLoaded.push(period); continue; }
      cache.set(period, inputs.balances);
      const unmapped = inputs.entities.reduce((n, e) => n + e.unmappedAccounts.length, 0);
      if (missing.length || unmapped) status.push(`${period}: missing ${missing.join(',') || '-'}; unmapped ${unmapped}`);
    }
    const baseline = all.filter(b => cache.has(b.period));
    const { compared, differences } = compareToBaseline(baseline, p => cache.get(p)!, ENTITIES);
    if (notLoaded.length) console.log(`Not loaded, not compared: ${notLoaded.join(', ')}`);
    console.log(`Compared ${compared} Databook figures (${[...cache.keys()].length} periods) against statements read from the database.`);
    for (const s of status) console.log(`  input gap ${s}`);
    const known = new Map(KNOWN_DATABOOK_ERRORS.map(k => [knownErrorKey(k), k.why]));
    const unexplained = differences.filter(d => !known.has(knownErrorKey({ ...d, diff: cents(d.diff) })));
    for (const d of differences) {
      const why = known.get(knownErrorKey({ ...d, diff: cents(d.diff) }));
      console.log(`  ${why ? 'KNOWN DATABOOK ERROR' : 'DIFF'} ${d.source} ${d.entity} ${d.period} ${d.lineCode}: ` +
        `portal ${cents(d.portal)} databook ${cents(d.value)} (${cents(d.diff)})${why ? ` — ${why}` : ''}`);
    }

    const sep = await loadStatementInputs(db, { periodKey: '2026-09', entityCodes: ENTITIES, basis: 'LATEST' });
    const st = computeStatements(sep.balances, ENTITIES);
    console.log(`\nSep-2026 ${sep.isFinal ? 'FINAL' : 'PRELIMINARY'} (submissions: ${sep.entities.map(e =>
      `${e.entity} ${e.submission ? `v${e.submission.version} ${e.submission.status}` : 'MISSING'}`).join(', ')}; ` +
      `unapproved mappings: ${sep.entities.reduce((n, e) => n + e.unapprovedMappings, 0)})`);
    console.log(`${'line'.padEnd(26)}${[...ENTITIES, CONSOLIDATED].map(e => e.padStart(16)).join('')}`);
    for (const code of ['PL.NET_REVENUE', 'PL.GROSS_PROFIT', 'PL.NET_INCOME', 'BS.TOTAL_ASSETS', 'BS.TOTAL_LIABILITIES_EQUITY'])
      console.log(`${code.padEnd(26)}${[...ENTITIES, CONSOLIDATED].map(e => cents(st.amounts.get(code)!.get(e)!).padStart(16)).join('')}`);
    console.log(`${'BS out of balance'.padEnd(26)}${[...ENTITIES, CONSOLIDATED].map(e => cents(st.checks.bsDifference.get(e)!).padStart(16)).join('')}`);

    console.log(unexplained.length
      ? `\nFAILED: ${unexplained.length} unexplained differences`
      : `\nPASSED: every compared figure ties to the cent${differences.length ? ` apart from ${differences.length} known Databook formula errors` : ''}`);
    if (unexplained.length) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
