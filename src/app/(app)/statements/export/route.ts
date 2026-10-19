// Excel download of the statement exactly as shown on screen, plus the accounts behind it and the notes an
// auditor needs (status, reasons, definitions, source files). Every download is recorded in the audit log.

import ExcelJS from 'exceljs';
import { AuthError, requirePermission } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db';
import { messages } from '@/lib/i18n';
import { ALL_LINES, EBITDA_DEFINITION } from '@/lib/statements/layout';
import { detailLinesOf, present } from '@/lib/statements/present';
import { Decimal } from '@/lib/money';
import { CONSOLIDATED, preliminaryReasons, resolvePeriod, statementView } from '../data';
import { parseParams } from '../params';

export const dynamic = 'force-dynamic';

const MONEY = '#,##0.00;(#,##0.00);"–"';
const PCT = '0.0%';

export async function GET(req: Request) {
  let s;
  try {
    s = await requirePermission('VIEW_STATEMENTS');
  } catch (e) {
    if (e instanceof AuthError) return new Response(e.code, { status: e.code === 'UNAUTHENTICATED' ? 401 : 403 });
    throw e;
  }
  const t = messages(s.locale);
  const ts = t.statements;
  const p = parseParams(Object.fromEntries(new URL(req.url).searchParams));
  const { period } = await resolvePeriod(p.period);
  if (!period) return new Response('No period', { status: 404 });
  const params = { ...p, period: period.key };
  const { columns, monthView, data, rows } = await statementView(s, params, period.key);

  const status = data.inputs.isFinal ? ts.final : ts.preliminary;
  const title = `${t.app.group} — ${params.stmt === 'PL' ? ts.pl : ts.bs}`;
  const viewLabel = params.stmt === 'PL' ? (monthView ? ts.month : ts.ytd) : '';
  const basisLabel = params.basis === 'APPROVED' ? ts.basisApproved : ts.basisLatest;
  const signLabel = params.signs === 'raw' ? ts.signsRaw : ts.signsNatural;
  const generated = new Date();

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ML Controller Portal';
  wb.created = generated;

  // ── Statement ──
  const ws = wb.addWorksheet(params.stmt === 'PL' ? 'P&L' : 'Balance Sheet', { views: [{ state: 'frozen', xSplit: 1, ySplit: 6 }] });
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow([[`${ts.period} ${period.key}`, viewLabel, basisLabel, signLabel].filter(Boolean).join(' · ')]);
  ws.addRow([`${status.toUpperCase()}${data.inputs.isFinal ? '' : ` — ${ts.preliminaryWhy}`}`]).font = { bold: true, color: { argb: data.inputs.isFinal ? 'FF2F6B3A' : 'FF9A6A00' } };
  ws.addRow([`${s.locale === 'es' ? 'Generado' : 'Generated'} ${generated.toISOString().replace('T', ' ').slice(0, 16)} UTC · ${s.email} · USD`]).font = { color: { argb: 'FF6B6B66' } };
  ws.addRow([]);
  const header = ws.addRow([ts.line, ...columns.map(c => (c === CONSOLIDATED ? ts.consolidated : c))]);
  header.font = { bold: true };
  header.eachCell(c => { c.border = { bottom: { style: 'thin' } }; c.alignment = { horizontal: 'right' }; });
  header.getCell(1).alignment = { horizontal: 'left' };

  for (const r of rows) {
    const values = r.values.map(v => (v === null ? null : Number(v.toDecimalPlaces(r.kind === 'RATIO' ? 6 : 2).toString())));
    const row = ws.addRow([r.label, ...(r.kind === 'MEMO_HEADER' ? [] : values)]);
    const bold = r.kind === 'SUBTOTAL' || r.kind === 'MEMO_TOTAL' || r.kind === 'CHECK' || r.kind === 'MEMO_HEADER';
    if (bold) row.font = { bold: true };
    if (r.kind === 'MEMO_HEADER') row.getCell(1).border = { top: { style: 'thin' } };
    if (r.kind === 'MEMO' || r.kind === 'RATIO') row.getCell(1).alignment = { indent: 1 };
    for (let i = 0; i < columns.length; i++) {
      const c = row.getCell(i + 2);
      c.numFmt = r.kind === 'RATIO' ? PCT : MONEY;
      if (r.kind === 'SUBTOTAL' || r.kind === 'MEMO_TOTAL') c.border = { top: { style: 'thin' } };
    }
  }
  if (params.stmt === 'PL') {
    ws.addRow([]);
    ws.addRow([`${ts.ebitdaDefinition}: ${s.locale === 'es' ? EBITDA_DEFINITION.sourceEs : EBITDA_DEFINITION.sourceEn}.`]).font = { italic: true };
  }
  ws.getColumn(1).width = 46;
  for (let i = 0; i < columns.length; i++) ws.getColumn(i + 2).width = 17;

  // ── Accounts behind the figures ──
  const acc = wb.addWorksheet(s.locale === 'es' ? 'Cuentas' : 'Accounts', { views: [{ state: 'frozen', ySplit: 1 }] });
  acc.addRow([ts.entity, ts.line, ts.stdAccount, '', ts.account, '', ts.mapping, `${ts.balance} (${ts.ytd})`]).font = { bold: true };
  const wanted = new Set(ALL_LINES.filter(l => l.statement === params.stmt && l.kind === 'DETAIL').flatMap(l => detailLinesOf(l.code)));
  const lineName = (code: string) => { const l = ALL_LINES.find(x => x.code === code)!; return s.locale === 'es' ? l.nameEs : l.nameEn; };
  const order = (code: string) => ALL_LINES.findIndex(l => l.code === code);
  const details = data.inputs.details.filter(d => wanted.has(d.lineCode))
    .sort((a, b) => columns.indexOf(a.entity) - columns.indexOf(b.entity) || order(a.lineCode) - order(b.lineCode) || a.accountCode.localeCompare(b.accountCode));
  for (const d of details) {
    const v = present(d.lineCode, new Decimal(d.balance), params.signs);
    const row = acc.addRow([d.entity, lineName(d.lineCode), d.stdAccountCode, d.stdAccountName, d.accountCode, d.accountName,
      t.mappingStatus[d.mappingStatus], Number(v.toDecimalPlaces(2).toString())]);
    row.getCell(8).numFmt = MONEY;
  }
  acc.autoFilter = { from: 'A1', to: 'H1' };
  [8, 26, 34, 26, 18, 40, 12, 18].forEach((w, i) => { acc.getColumn(i + 1).width = w; });

  // ── Notes ──
  const notes = wb.addWorksheet(s.locale === 'es' ? 'Notas' : 'Notes');
  notes.getColumn(1).width = 120;
  const note = (text: string, bold = false) => { notes.addRow([text]).font = { bold }; };
  note(title, true);
  note(`${ts.status}: ${status}`);
  for (const r of preliminaryReasons(data.inputs, t)) note(`• ${r}`);
  note('');
  note(s.locale === 'es' ? 'Convenciones' : 'Conventions', true);
  note(ts.ytdNote);
  note(params.signs === 'raw'
    ? (s.locale === 'es' ? 'Signos del Databook: débitos positivos, créditos negativos.' : 'Databook signs: debits positive, credits negative.')
    : (s.locale === 'es' ? 'Signos naturales: ingresos y utilidades positivos; costos y gastos entre paréntesis; pasivos y patrimonio positivos.'
      : 'Natural signs: revenue and profit positive; costs in parentheses; liabilities and equity positive.'));
  if (monthView) note(s.locale === 'es' ? 'Vista mensual: resultados del mes = acumulado del mes − acumulado del mes anterior.' : 'Month view: month result = YTD this month − YTD prior month.');
  if (params.stmt === 'PL') note(`${ts.ebitdaDefinition} (non-GAAP): ${s.locale === 'es' ? EBITDA_DEFINITION.sourceEs : EBITDA_DEFINITION.sourceEn}.`);
  note('');
  note(ts.source, true);
  const subIds = data.inputs.entities.flatMap(e => (e.submission ? [e.submission.id] : []));
  const subs = await db.tbSubmission.findMany({ where: { id: { in: subIds } }, include: { entity: true, batch: true } });
  for (const sub of subs.sort((a, b) => a.entity.sortOrder - b.entity.sortOrder))
    note(`${sub.entity.code} v${sub.version} ${t.submissionStatus[sub.status]} — ${sub.batch.fileName} (SHA-256 ${sub.batch.sha256.slice(0, 16)}…)`);

  const buf = await wb.xlsx.writeBuffer();
  const file = `ML-Group_${params.stmt}_${period.key}${params.stmt === 'PL' ? `_${monthView ? 'Month' : 'YTD'}` : ''}_${data.inputs.isFinal ? 'FINAL' : 'PRELIMINARY'}.xlsx`;

  await audit({
    userId: s.id, action: 'EXPORT', objectType: 'Statement', objectId: `${params.stmt}:${period.key}`,
    summary: `Downloaded ${file} (${columns.join(', ')}; ${data.inputs.isFinal ? 'final' : 'preliminary'})`,
    after: { stmt: params.stmt, period: period.key, view: params.view, basis: params.basis, signs: params.signs, columns },
  });

  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${file}"`,
      'Cache-Control': 'no-store',
    },
  });
}
