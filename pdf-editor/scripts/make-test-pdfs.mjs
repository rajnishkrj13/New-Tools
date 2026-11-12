// Generates test-assets/sample.pdf: 5 pages covering portrait, landscape, a rotated page,
// a cropped page, the three standard font families and (when available) an embedded TrueType font.
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-assets');
mkdirSync(out, { recursive: true });

const LOREM =
  'The editor keeps every page of the original document intact and writes only the changes on top of it. ' +
  'When a sentence becomes longer than its line, the following words move down to the next line and the rest ' +
  'of the paragraph follows, so nothing overlaps. Removing words pulls the text back up again.';
const SECOND =
  'Payment is due within thirty days of the invoice date. Please quote the invoice number with your transfer. ' +
  'Late payments are subject to a monthly interest charge as described in the general terms.';

function wrap(text, font, size, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function paragraph(page, text, font, size, x, top, width, leading) {
  let y = top;
  for (const line of wrap(text, font, size, width)) {
    page.drawText(line, { x, y, size, font, color: rgb(0.1, 0.1, 0.12) });
    y -= leading;
  }
  return y;
}

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const helv = await doc.embedFont(StandardFonts.Helvetica);
const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
const times = await doc.embedFont(StandardFonts.TimesRoman);
const courier = await doc.embedFont(StandardFonts.Courier);

// Page 1: portrait Letter, Helvetica
let p = doc.addPage([612, 792]);
p.drawText('Quarterly Report', { x: 72, y: 720, size: 22, font: helvBold });
let y = paragraph(p, LOREM, helv, 11, 72, 680, 468, 15);
y -= 20;
p.drawText('Invoice Number: INV-2026-001', { x: 72, y, size: 12, font: helv });
p.drawText('Total due: $1,250.00', { x: 380, y, size: 12, font: helvBold });
y -= 40;
paragraph(p, SECOND, helv, 11, 72, y, 468, 15);
p.drawText('Page 1 - portrait', { x: 72, y: 40, size: 9, font: helv, color: rgb(0.4, 0.4, 0.4) });

// Page 2: Times and Courier
p = doc.addPage([612, 792]);
p.drawText('Terms and Conditions', { x: 72, y: 720, size: 18, font: times });
y = paragraph(p, LOREM, times, 12, 72, 684, 468, 16);
y -= 24;
for (const row of ['ITEM-001    Widget, large        4    120.00', 'ITEM-002    Widget, small       10     45.50']) {
  p.drawText(row, { x: 72, y, size: 10, font: courier });
  y -= 14;
}
p.drawText('Page 2 - serif and monospace', { x: 72, y: 40, size: 9, font: helv, color: rgb(0.4, 0.4, 0.4) });

// Page 3: landscape
p = doc.addPage([792, 612]);
p.drawText('Landscape Overview', { x: 72, y: 540, size: 20, font: helvBold });
paragraph(p, LOREM, helv, 12, 72, 500, 648, 17);
p.drawRectangle({ x: 72, y: 120, width: 300, height: 160, color: rgb(0.86, 0.92, 1), borderColor: rgb(0.2, 0.4, 0.8), borderWidth: 1 });
p.drawText('Chart area', { x: 180, y: 195, size: 14, font: helv, color: rgb(0.2, 0.3, 0.6) });

// Page 4: portrait media box shown rotated by 90 degrees
p = doc.addPage([612, 792]);
p.setRotation(degrees(90));
// With /Rotate 90 the viewer shows PDF (x, y) at view (y, x); text drawn rotated by 90
// degrees therefore reads upright on screen, like a scanned or landscape-exported page.
const upright = (text, viewX, viewBaseline, size, font) =>
  p.drawText(text, { x: viewBaseline, y: viewX, size, font, rotate: degrees(90), color: rgb(0.1, 0.1, 0.12) });
upright('Rotated Page Heading', 72, 90, 20, helvBold);
wrap(SECOND, helv, 12, 620).forEach((line, i) => upright(line, 72, 130 + i * 17, 12, helv));
upright('Reference: ROT-4471', 72, 240, 12, helv);
// One line that really is sideways on screen (cannot be edited in place).
p.drawText('Sideways margin note', { x: 580, y: 300, size: 9, font: helv, color: rgb(0.4, 0.4, 0.4) });

// Page 5: A4 with a CropBox and an embedded (non-standard) font
p = doc.addPage([595, 842]);
p.setCropBox(30, 40, 535, 760);
let embedded = helv;
let embeddedName = 'Helvetica (no system TrueType font found)';
for (const file of ['C:/Windows/Fonts/verdana.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Verdana.ttf']) {
  if (existsSync(file)) {
    embedded = await doc.embedFont(readFileSync(file), { subset: true });
    embeddedName = file.split('/').pop();
    break;
  }
}
p.drawText('Cropped Page With Embedded Font', { x: 60, y: 740, size: 16, font: embedded });
paragraph(p, LOREM, embedded, 10.5, 60, 705, 440, 15);
p.drawText('Customer: Northwind Traders', { x: 60, y: 560, size: 12, font: embedded });

writeFileSync(join(out, 'sample.pdf'), await doc.save());
console.log(`test-assets/sample.pdf written (5 pages, embedded font: ${embeddedName})`);
