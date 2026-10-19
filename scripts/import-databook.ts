// Load the Databook into the portal.
//   npm run db:import:databook -- "<path to .xlsx>" --through 2026-09 --as controller@example.com
// The file is read in place and copied unchanged to STORAGE_DIR; it never enters the repo.

import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { basename } from 'node:path';
import { parseDatabook } from '../src/lib/databook/parse';
import { loadDatabook } from '../src/lib/databook/load';
import { checkOpenings } from '../src/lib/databook/openings';
import { sha256OfFile, storeOriginal } from '../src/lib/storage';
import { cents } from '../src/lib/money';

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  const path = process.argv[2];
  if (!path || path.startsWith('--')) throw new Error('Usage: import-databook <file.xlsx> --through YYYY-MM --as <email>');
  const through = arg('through', '2026-09')!;
  const email = arg('as', process.env.SEED_ADMIN_EMAIL)?.toLowerCase();
  if (!/^\d{4}-\d{2}$/.test(through)) throw new Error(`--through must be YYYY-MM, got ${through}`);

  const db = new PrismaClient();
  try {
    const user = email ? await db.user.findUnique({ where: { email } }) : null;
    if (!user) throw new Error(`No portal user ${email ?? '(none given)'}; pass --as <email> of a seeded user`);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path);
    const parsed = parseDatabook(wb, { through });
    const errors = parsed.issues.filter(i => i.severity === 'ERROR');
    const warnings = parsed.issues.filter(i => i.severity === 'WARNING');
    console.log(`Parsed ${parsed.entities.map(e => `${e.entity}:${e.accounts.length}`).join(' ')} accounts, ` +
      `periods ${parsed.periods[0]}..${parsed.periods.at(-1)}; ${errors.length} errors, ${warnings.length} warnings`);
    for (const i of errors) console.log(`  ERROR ${i.code} ${i.tab}!${i.row ?? ''} ${i.message}`);
    if (errors.length) process.exitCode = 1;
    if (errors.length) return;

    const { sha256, sizeBytes } = await sha256OfFile(path);
    const storageKey = await storeOriginal(path, sha256);
    const summary = await loadDatabook(db, { parsed, file: { name: basename(path), sha256, sizeBytes, storageKey }, userId: user.id });
    console.log('Load', summary);

    const openings = checkOpenings(parsed);
    if (openings.length) {
      console.log(`\n${openings.length} opening balances do not roll forward from the prior December (for the Controller):`);
      for (const d of openings)
        console.log(`  ${d.entity} ${d.year} ${d.lineCode.padEnd(28)} rolled ${cents(d.expected).padStart(15)}  opening ${cents(d.actual).padStart(15)}  diff ${cents(d.diff)}`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
