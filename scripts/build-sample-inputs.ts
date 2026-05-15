import { writeFileSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from '@e965/xlsx';
import JSZip from 'jszip';

const ROOT = path.resolve(__dirname, '..', 'planning', 'sample-inputs');

async function buildPptx(): Promise<void> {
  // Hand-roll a minimal valid .pptx: the OOXML structure needs
  // [Content_Types].xml + _rels/.rels + ppt/presentation.xml + per-slide
  // XML + relationships. This is fragile but Reachy's pptx parser only
  // looks at ppt/slides/*.xml so we don't need PowerPoint to accept it
  // — JSZip + the minimal scaffolding is enough for round-trip testing.
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
    <p:sldId id="257" r:id="rId2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
    <p:sldId id="258" r:id="rId3" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
  </p:sldIdLst>
</p:presentation>`,
  );

  const slideTexts = [
    [
      'Reachy',
      'Brand stuff in. Marketing assets out.',
      'A self-hosted autopilot for indie founders.',
    ],
    [
      'Step 1 — Ingest',
      'Drop a doc, a deck, a sheet, a repo, an image, a video.',
      'Reachy reads everything before asking a single question.',
    ],
    ['Step 2 — Brief', 'Extract the brand brief.', 'Tone. Audience. Voice. Go.'],
  ];
  slideTexts.forEach((runs, i) => {
    const xmlRuns = runs.map((r) => `<a:p><a:r><a:t>${escapeXml(r)}</a:t></a:r></a:p>`).join('');
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>${xmlRuns}</p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`,
    );
  });

  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  writeFileSync(path.join(ROOT, 'sample.pptx'), bytes);
  console.log(`wrote sample.pptx (${bytes.byteLength} bytes)`);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildXlsx(): void {
  const wb = XLSX.utils.book_new();
  const customers = [
    ['Name', 'Email', 'Plan', 'MRR'],
    ['Ana Pérez', 'ana@example.com', 'Growth', 49],
    ['Bruno Díaz', 'bruno@example.com', 'Starter', 19],
    ['Carla Ruiz', 'carla@example.com', 'Growth', 49],
    ['Diego Lara', 'diego@example.com', 'Pro', 99],
    ['Elena Soto', 'elena@example.com', 'Starter', 19],
    ['Felipe Vega', 'felipe@example.com', 'Growth', 49],
    ['Gabriela Mora', 'gabriela@example.com', 'Pro', 99],
    ['Héctor Ramos', 'hector@example.com', 'Starter', 19],
    ['Isabel Cano', 'isabel@example.com', 'Growth', 49],
  ];
  const products = [
    ['SKU', 'Title', 'Price', 'Stock'],
    ['R-001', 'Editorial set', 24, 12],
    ['R-002', 'Brand audit', 199, 6],
    ['R-003', 'Reel pack 4', 64, 30],
    ['R-004', 'Identity kit', 299, 3],
    ['R-005', 'Copy refresh', 49, 18],
    ['R-006', 'Launch campaign', 499, 2],
    ['R-007', 'Quarterly retainer', 1500, 1],
    ['R-008', 'Email header pack', 39, 22],
    ['R-009', 'OG asset bundle', 79, 14],
    ['R-010', 'Style guide', 149, 5],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(customers), 'Customers');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(products), 'Products');
  XLSX.writeFile(wb, path.join(ROOT, 'sample.xlsx'));
  console.log('wrote sample.xlsx');
}

function buildRepo(): void {
  const repoDir = path.join(ROOT, 'sample-repo');
  writeFileSync(
    path.join(repoDir, 'README.md'),
    `# Reachy demo repo

A minimal sample repo used to exercise Reachy's autopilot ingestion.

## Stack

- Node 22 + TypeScript
- One library, one CLI entrypoint

## What it does

Computes Fibonacci sequences for marketing-asset cache eviction. Not really, but
the parser doesn't care about the README's truth value.
`,
  );
  writeFileSync(
    path.join(repoDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'reachy-sample',
        version: '0.1.0',
        type: 'module',
        scripts: { build: 'tsc', start: 'node dist/index.js' },
        dependencies: {},
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(repoDir, 'src', 'index.ts'),
    `// Entry point for the Reachy sample repo.
// Demonstrates the surface area the code parser is expected to recover.

export interface CacheEntry {
  key: string;
  bytes: number;
}

export function fib(n: number): number {
  if (n < 2) return n;
  let a = 0;
  let b = 1;
  for (let i = 2; i <= n; i++) {
    const next = a + b;
    a = b;
    b = next;
  }
  return b;
}

export const DEFAULT_LIMIT = 64 * 1024;

export class CacheService {
  private readonly entries: CacheEntry[] = [];

  public push(entry: CacheEntry): void {
    this.entries.push(entry);
  }

  public total(): number {
    return this.entries.reduce((acc, e) => acc + e.bytes, 0);
  }
}
`,
  );
  writeFileSync(
    path.join(repoDir, 'src', 'cli.ts'),
    `import { CacheService, fib } from './index';

const svc = new CacheService();
svc.push({ key: 'a', bytes: fib(20) });
console.log('total bytes', svc.total());
`,
  );
  console.log('wrote sample-repo/');
}

async function main() {
  await buildPptx();
  buildXlsx();
  buildRepo();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
