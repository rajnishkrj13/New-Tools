// Copies files the browser loads at run time into /public: the pdf.js worker (matching the
// installed pdfjs-dist) and, when it has been built, the PDF editor app.
import { cpSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

mkdirSync(join(pub, 'pdfjs'), { recursive: true });
copyFileSync(join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), join(pub, 'pdfjs/pdf.worker.min.mjs'));

const editor = join(root, '../pdf-editor/dist-embed');
if (existsSync(editor)) {
  cpSync(editor, join(pub, 'pdf-editor/app'), { recursive: true });
  console.log('copy-assets: pdf.js worker and the PDF editor copied to public/');
} else {
  console.log('copy-assets: pdf.js worker copied. (PDF editor not built yet: run "npm run build:editor".)');
}
