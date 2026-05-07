import 'server-only';
import { extractText } from 'unpdf';
import { BRIEF_MIME_ALLOWLIST, type BriefMime } from './escape';

export interface ParseBriefOk {
  ok: true;
  text: string;
  warnings: string[];
}
export interface ParseBriefErr {
  ok: false;
  error: 'unsupported-mime' | 'empty-extraction' | 'parse-failed' | 'too-large';
  message: string;
}
export type ParseBriefResult = ParseBriefOk | ParseBriefErr;

export interface ParseBriefInput {
  /** The raw bytes of the uploaded file, or undefined when this is pasted text. */
  bytes?: Uint8Array;
  /** UTF-8 string for pasted text. Mutually exclusive with `bytes`. */
  pastedText?: string;
  mime: BriefMime;
}

function isAllowedMime(value: string): value is BriefMime {
  return (BRIEF_MIME_ALLOWLIST as readonly string[]).includes(value);
}

export async function parseBrief(input: ParseBriefInput): Promise<ParseBriefResult> {
  if (!isAllowedMime(input.mime)) {
    return {
      ok: false,
      error: 'unsupported-mime',
      message: `Unsupported file type: ${input.mime}`,
    };
  }

  const warnings: string[] = [];
  let text: string;

  if (input.pastedText !== undefined) {
    text = input.pastedText;
  } else if (input.bytes !== undefined) {
    try {
      switch (input.mime) {
        case 'text/plain':
        case 'text/markdown':
          text = new TextDecoder('utf-8').decode(input.bytes);
          break;
        case 'application/pdf': {
          const result = await extractText(input.bytes, { mergePages: true });
          // unpdf returns { text: string | string[], totalPages }.
          text = Array.isArray(result.text) ? result.text.join('\n') : result.text;
          break;
        }
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
          // mammoth resolves a Buffer-shaped argument; Uint8Array works.
          const mammoth = await import('mammoth');
          const out = await mammoth.extractRawText({ buffer: Buffer.from(input.bytes) });
          text = out.value;
          if (out.messages.length > 0) {
            warnings.push(`mammoth: ${out.messages.length} formatting note(s) ignored`);
          }
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown parse error';
      return { ok: false, error: 'parse-failed', message: msg };
    }
  } else {
    return { ok: false, error: 'parse-failed', message: 'no input provided' };
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      error: 'empty-extraction',
      message: 'No text found in this document.',
    };
  }

  return { ok: true, text: trimmed, warnings };
}
