import 'server-only';
import * as XLSX from '@e965/xlsx';
import type { ParseCtx, ParsedFile, ParsedTable } from '../types';

/** Parse an .xlsx with the SheetJS community mirror (@e965/xlsx).
 *  npm `xlsx` was abandoned + has CVE-2023-30533; the @e965 fork is
 *  the maintained drop-in. */
export async function parse(buffer: Buffer, filename: string, _ctx: ParseCtx): Promise<ParsedFile> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const tables: ParsedTable[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: '',
    });
    const rows = aoa.map((row) =>
      Array.isArray(row) ? row.map((cell) => (cell == null ? '' : String(cell))) : [],
    );
    if (rows.length === 0) continue;
    tables.push({ source: `${filename} · ${sheetName}`, rows });
  }
  return {
    filename,
    bytes: buffer.byteLength,
    textBlocks: [],
    images: [],
    tables,
  };
}
