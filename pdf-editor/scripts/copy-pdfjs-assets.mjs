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

// Text recognition (OCR): worker, WebAssembly engine and language data, also served locally.
const ocr = join(root, 'public', 'ocr');
const modules = join(root, 'node_modules');
if (existsSync(join(modules, 'tesseract.js'))) {
  mkdirSync(join(ocr, 'core'), { recursive: true });
  mkdirSync(join(ocr, 'lang'), { recursive: true });
  cpSync(join(modules, 'tesseract.js', 'dist', 'worker.min.js'), join(ocr, 'worker.min.js'));
  for (const core of ['tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm']) {
    for (const ext of ['.wasm.js', '.js', '.wasm']) cpSync(join(modules, 'tesseract.js-core', core + ext), join(ocr, 'core', core + ext));
  }
  for (const lang of ['eng', 'hin']) {
    cpSync(join(modules, '@tesseract.js-data', lang, '4.0.0_best_int', lang + '.traineddata.gz'), join(ocr, 'lang', lang + '.traineddata.gz'));
  }
  console.log('[copy-pdfjs-assets] copied the OCR engine and language data to public/ocr');
}
