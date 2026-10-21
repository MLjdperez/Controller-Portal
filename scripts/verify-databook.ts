// End-to-end acceptance: statements built from the DATABASE equal the Databook's own statements.
//   npm run db:verify:databook -- "<path to .xlsx>" [--through 2026-09]
// Exit code 1 on any difference over half a cent that isn't a recorded Databook formula error.

import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { DATABOOK_ENTITIES, verifyAgainstDb } from '../src/lib/databook/check';
import { loadStatementInputs } from '../src/lib/statements/load';
import { computeStatements, CONSOLIDATED } from '../src/lib/statements/engine';
import { cents } from '../src/lib/money';

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: verify-databook <file.xlsx> [--through YYYY-MM]');
  const i = process.argv.indexOf('--through');
  const through = i > 0 ? process.argv[i + 1]! : '9999-12';
  const db = new PrismaClient();
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path);
    const v = await verifyAgainstDb(db, wb, through);
    if (v.notLoaded.length) console.log(`Not loaded, not compared: ${v.notLoaded.join(', ')}`);
    console.log(`Compared ${v.compared} Databook figures (${v.periods} periods) against statements read from the database.`);
    for (const g of v.gaps) console.log(`  input gap ${g}`);
    for (const d of v.differences)
      console.log(`  ${d.knownWhy ? 'KNOWN DATABOOK ERROR' : 'DIFF'} ${d.source} ${d.entity} ${d.period} ${d.lineCode}: ` +
        `portal ${cents(d.portal)} databook ${cents(d.value)} (${cents(d.diff)})${d.knownWhy ? ` — ${d.knownWhy}` : ''}`);

    const last = v.periods ? [...new Set(v.differences.map(d => d.period))].concat('2026-09').sort().at(-1)! : '2026-09';
    const sep = await loadStatementInputs(db, { periodKey: last, entityCodes: DATABOOK_ENTITIES, basis: 'LATEST' });
    const st = computeStatements(sep.balances, DATABOOK_ENTITIES);
    console.log(`\n${last} ${sep.isFinal ? 'FINAL' : 'PRELIMINARY'} (submissions: ${sep.entities.map(e =>
      `${e.entity} ${e.submission ? `v${e.submission.version} ${e.submission.status}` : 'MISSING'}`).join(', ')})`);
    console.log(`${'BS out of balance'.padEnd(26)}${[...DATABOOK_ENTITIES, CONSOLIDATED].map(e => cents(st.checks.bsDifference.get(e)!).padStart(14)).join('')}`);

    console.log(v.unexplained
      ? `\nFAILED: ${v.unexplained} unexplained differences`
      : `\nPASSED: every compared figure ties to the cent${v.differences.length ? ` apart from ${v.differences.length} known Databook formula errors` : ''}`);
    if (v.unexplained) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
