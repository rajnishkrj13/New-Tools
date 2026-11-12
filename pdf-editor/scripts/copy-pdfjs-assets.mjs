// Copies pdf.js CMaps and standard font data into public/ so nothing is fetched from a CDN.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dest = join(root, 'public', 'pdfjs');
if (!existsSync(src)) {
  console.warn('[copy-pdfjs-assets] pdfjs-dist is not installed yet, skipping.');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts']) {
  cpSync(join(src, dir), join(dest, dir), { recursive: true });
}
console.log('[copy-pdfjs-assets] copied cmaps and standard_fonts to public/pdfjs');
