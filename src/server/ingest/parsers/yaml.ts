import 'server-only';
import yaml from 'js-yaml';
import type { ParseCtx, ParsedFile } from '../types';
import { clipText } from '../util';

type YamlValue = string | number | boolean | null | YamlValue[] | { [k: string]: YamlValue };

function flatten(value: YamlValue, prefix: string, out: string[]): void {
  if (value === null || value === undefined) {
    out.push(`${prefix}: null`);
    return;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    out.push(`${prefix}: ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push(`${prefix}: []`);
      return;
    }
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (item !== undefined) flatten(item, `${prefix}[${i}]`, out);
    }
    return;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    out.push(`${prefix}: {}`);
    return;
  }
  for (const [k, v] of entries) {
    const next = prefix.length === 0 ? k : `${prefix}.${k}`;
    flatten(v, next, out);
  }
}

export async function parse(buffer: Buffer, filename: string, _ctx: ParseCtx): Promise<ParsedFile> {
  const raw = buffer.toString('utf-8');
  let value: YamlValue;
  try {
    value = yaml.load(raw) as YamlValue;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      filename,
      bytes: 0,
      textBlocks: [{ source: filename, content: `[yaml parse error] ${msg}` }],
      images: [],
    };
  }
  const lines: string[] = [];
  flatten(value, '', lines);
  const joined = lines.join('\n');
  const { text, truncated } = clipText(joined);
  return {
    filename,
    bytes: Buffer.byteLength(text, 'utf-8'),
    textBlocks: [{ source: filename, content: text }],
    images: [],
    truncated,
  };
}
