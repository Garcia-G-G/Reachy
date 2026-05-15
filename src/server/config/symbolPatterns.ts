import 'server-only';

/**
 * Regex patterns the code parser uses to extract "exported symbols" per
 * language. Cannot be derived from content — each language has its own
 * idiom for "public surface", and pattern fidelity matters more than
 * coverage (false-positive symbols pollute the bundle).
 *
 * Each language has 1+ patterns. The code parser runs every pattern,
 * collects capture-group 1 from every match, de-dupes, and caps at
 * MAX_SYMBOLS to keep the bundle bounded.
 */

export interface SymbolPattern {
  pattern: RegExp;
  /** Comment for future maintainers: what kind of symbol this catches.
   *  Not consumed at runtime but read when the pattern needs tightening. */
  description: string;
}

export const SYMBOL_PATTERNS: Record<string, readonly SymbolPattern[]> = {
  TypeScript: [
    {
      pattern: /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
      description: 'exported function declaration',
    },
    {
      pattern: /\bexport\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g,
      description: 'exported class declaration',
    },
    {
      pattern: /\bexport\s+(?:type|interface|enum)\s+([A-Za-z_$][\w$]*)/g,
      description: 'exported type / interface / enum',
    },
    {
      pattern: /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
      description: 'exported const / let / var',
    },
  ],
  'TypeScript (React)': [
    {
      pattern: /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
      description: 'exported function (often a component)',
    },
    {
      pattern: /\bexport\s+(?:const|let)\s+([A-Z][\w$]*)\s*[:=]/g,
      description: 'exported PascalCase const (typically a component)',
    },
  ],
  JavaScript: [
    {
      pattern: /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
      description: 'exported function declaration',
    },
    {
      pattern: /\bexport\s+class\s+([A-Za-z_$][\w$]*)/g,
      description: 'exported class declaration',
    },
    {
      pattern: /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
      description: 'exported const / let / var',
    },
    {
      pattern: /\bmodule\.exports\.([A-Za-z_$][\w$]*)\s*=/g,
      description: 'CommonJS module.exports.X',
    },
  ],
  Python: [
    {
      pattern: /^def\s+([a-zA-Z_][\w]*)\s*\(/gm,
      description: 'top-level def',
    },
    {
      pattern: /^class\s+([a-zA-Z_][\w]*)\s*[(:]/gm,
      description: 'top-level class',
    },
  ],
  Ruby: [
    { pattern: /^class\s+([A-Z][\w]*)/gm, description: 'class declaration' },
    { pattern: /^module\s+([A-Z][\w]*)/gm, description: 'module declaration' },
    { pattern: /^def\s+([a-z_][\w?!=]*)/gm, description: 'top-level method' },
  ],
  Go: [
    {
      pattern: /^func\s+(?:\([^)]*\)\s+)?([A-Z][\w]*)\s*\(/gm,
      description: 'exported func (capitalized identifier)',
    },
    {
      pattern: /^type\s+([A-Z][\w]*)\s+(?:struct|interface|=)/gm,
      description: 'exported type declaration',
    },
  ],
  Rust: [
    {
      pattern: /^pub\s+(?:async\s+)?fn\s+([a-zA-Z_][\w]*)/gm,
      description: 'pub fn',
    },
    {
      pattern: /^pub\s+(?:struct|enum|trait)\s+([A-Za-z_][\w]*)/gm,
      description: 'pub struct / enum / trait',
    },
  ],
  Java: [
    {
      pattern:
        /\bpublic\s+(?:static\s+)?(?:final\s+)?(?:class|interface|enum)\s+([A-Za-z_$][\w$]*)/g,
      description: 'public type declaration',
    },
  ],
  PHP: [
    { pattern: /^class\s+([A-Za-z_][\w]*)/gm, description: 'class declaration' },
    { pattern: /^function\s+([a-zA-Z_][\w]*)/gm, description: 'top-level function' },
  ],
  Shell: [
    {
      pattern: /^(?:function\s+)?([a-zA-Z_][\w]*)\s*\(\s*\)\s*\{/gm,
      description: 'shell function',
    },
  ],
  SQL: [
    {
      pattern:
        /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|FUNCTION|TYPE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?[\w]+"?\.)?"?([\w]+)"?/gim,
      description: 'CREATE statement target',
    },
  ],
};

/** Cap exported-symbols list per file so a 5000-LOC file does not blow
 *  up the bundle. The cap is intentional, not derivable. */
export const MAX_SYMBOLS_PER_FILE = 24;
