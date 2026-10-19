// Read an uploaded file into a grid of cells for parseTbGrid. .xlsx: the first sheet with a recognisable header.
import ExcelJS from 'exceljs';
import { csvToGrid, parseTbGrid, type Cell, type TbParse } from './parse';

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return String(v);
  const o = v as { result?: unknown; richText?: { text: string }[]; text?: string; error?: string };
  if (o.error) return `#${o.error}`;
  if ('result' in o) return o.result === undefined || o.result === null ? 0 : (o.result as Cell); // formula: cached value
  if (o.richText) return o.richText.map(x => x.text).join('');
  if (o.text) return o.text;
  return null;
}

export async function parseTbFile(fileName: string, bytes: Uint8Array, functionalCurrency: string): Promise<TbParse & { sheet: string | null }> {
  if (/\.csv$/i.test(fileName))
    return { ...parseTbGrid(csvToGrid(new TextDecoder('utf-8').decode(bytes)), { functionalCurrency }), sheet: null };

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  let first: (TbParse & { sheet: string | null }) | null = null;
  for (const ws of wb.worksheets) {
    const grid: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      const cells: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (c, col) => { cells[col - 1] = cellValue(c.value); });
      grid[r - 1] = cells;
    });
    const p = { ...parseTbGrid(grid, { functionalCurrency }), sheet: ws.name };
    if (p.headerRow !== null) return p;
    first ??= p;
  }
  return first ?? { ...parseTbGrid([], { functionalCurrency }), sheet: null };
}
