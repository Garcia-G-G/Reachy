import 'server-only';
import Papa from 'papaparse';
import type { ParseCtx, ParsedFile, ParsedTable } from '../types';

export async function parse(buffer: Buffer, filename: string, _ctx: ParseCtx): Promise<ParsedFile> {
  const raw = buffer.toString('utf-8');
  const result = Papa.parse<string[]>(raw, { skipEmptyLines: true });
  const rows = (result.data ?? []).map((row) =>
    Array.isArray(row) ? row.map((cell) => (cell == null ? '' : String(cell))) : [],
  );
  const tables: ParsedTable[] = rows.length > 0 ? [{ source: filename, rows }] : [];
  return {
    filename,
    bytes: Buffer.byteLength(raw, 'utf-8'),
    textBlocks: [],
    images: [],
    tables,
  };
}
