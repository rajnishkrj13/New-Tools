import { describe, expect, it } from 'vitest';
import {
  BOLD_STEM,
  decideStyle,
  detectLineStyle,
  inkBox,
  inkFromRgba,
  styleFontName,
  wordFeatures,
  type InkMap,
  type MeasuredWord,
  type PagePixels,
  type ScanFamily,
  type ScanStyle,
  type WidthOf,
} from '../src/engines/ScanFontStyle';
import { resolvePdfFont } from '../src/engines/FontManager';
import { buildLines } from '../src/engines/PdfTextExtractor';
import { groupParagraphs } from '../src/engines/TextReflowEngine';
import { createTextEdit } from '../src/engines/TextEditLayout';
import type { RawTextItem } from '../src/types/text';
import { setMeasureImpl } from '../src/utils/fontUtils';

// No canvas in Node: text is measured at half an em per character.
setMeasureImpl((text, _font, size) => text.length * size * 0.5);

/**
 * A synthetic printed word: `letters` "n"-shaped letters (two stems joined by a thin arch at
 * the top), with optional serif feet, drawn with a slant. Ink 1, paper 0.
 */
interface Glyphs {
  letters?: number;
  xh?: number;
  stem: number;
  arch?: number;
  foot?: number;
  shear?: number;
}
function drawWord(g: Glyphs, into?: { page: PagePixels; x: number; y: number; ink?: [number, number, number] }): InkMap {
  const letters = g.letters ?? 4;
  const xh = g.xh ?? 40;
  const arch = g.arch ?? Math.max(2, Math.round(g.stem * 0.8));
  const foot = g.foot ?? 0;
  const shear = g.shear ?? 0;
  const footH = foot ? Math.max(3, Math.round(xh * 0.08)) : 0;
  const counter = Math.round(g.stem * 1.6);
  const advance = 2 * g.stem + counter + Math.max(6, 2 * foot + 4);
  const margin = 6 + Math.ceil(xh * Math.abs(shear));
  const width = margin * 2 + letters * advance;
  const height = xh + 12;
  const data = new Float32Array(width * height);
  const fill = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        // Lean: the higher the row, the further right.
        const sx = Math.round(x + (y0 + h - 1 - y + (6 + xh - (y0 + h))) * shear);
        if (sx >= 0 && sx < width && y >= 0 && y < height) data[y * width + sx] = 1;
      }
  };
  const top = 6;
  for (let i = 0; i < letters; i++) {
    const x = margin + i * advance + foot;
    fill(x, top, g.stem, xh); // left stem
    fill(x + g.stem + counter, top, g.stem, xh); // right stem
    fill(x, top, 2 * g.stem + counter, arch); // arch
    if (foot) {
      fill(x - foot, top + xh - footH, g.stem + 2 * foot, footH);
      fill(x + g.stem + counter - foot, top + xh - footH, g.stem + 2 * foot, footH);
    }
  }
  if (into) {
    const [r, gr, b] = into.ink ?? [20, 20, 20];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[y * width + x]) {
          const i = ((into.y + y) * into.page.width + into.x + x) * 4;
          into.page.data[i] = r;
          into.page.data[i + 1] = gr;
          into.page.data[i + 2] = b;
        }
  }
  return { width, height, data };
}

describe('ScanFontStyle: measuring printed words', () => {
  it('finds the ink box and ignores specks of noise', () => {
    const m = drawWord({ stem: 5 });
    m.data[0] = 1; // a speck in the corner
    const box = inkBox(m)!;
    expect(box.x).toBeGreaterThan(0);
    expect(box.y).toBe(6);
    expect(box.height).toBe(40);
  });

  it('measures stroke weight relative to the x-height', () => {
    const regular = wordFeatures(drawWord({ stem: 6 }))!;
    const bold = wordFeatures(drawWord({ stem: 11 }))!;
    expect(regular.xHeight).toBeCloseTo(40, 0);
    expect(regular.stem).toBeCloseTo(6, 0);
    expect(bold.stem).toBeCloseTo(11, 0);
    expect(regular.stem / regular.xHeight).toBeLessThan(BOLD_STEM);
    expect(bold.stem / bold.xHeight).toBeGreaterThan(BOLD_STEM);
  });

  it('measures the slant of italic letters and finds upright ones upright', () => {
    expect(Math.abs(wordFeatures(drawWord({ stem: 6 }))!.slant)).toBeLessThan(2);
    const italic = wordFeatures(drawWord({ stem: 6, shear: 0.25 }))!;
    expect(italic.slant).toBeGreaterThan(10);
    expect(italic.slant).toBeLessThan(18);
  });

  it('tells feet with serifs from plain stroke ends, also on slanted letters', () => {
    const sans = wordFeatures(drawWord({ stem: 6 }))!;
    const serif = wordFeatures(drawWord({ stem: 6, foot: 4 }))!;
    const median = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1];
    expect(Math.abs(median(sans.feet))).toBeLessThan(0.01);
    // Feet 4 px either side of a 6 px stem on a 40 px x-height: 8 / 40 = 0.2.
    expect(median(serif.feet)).toBeCloseTo(0.2, 1);
    const slantedSerif = wordFeatures(drawWord({ stem: 6, foot: 4, shear: 0.2 }))!;
    expect(median(slantedSerif.feet)).toBeGreaterThan(0.1);
  });

  it('measures thin strokes for the thick-thin contrast', () => {
    const f = wordFeatures(drawWord({ stem: 8, arch: 3 }))!;
    expect(f.thin).toBeGreaterThan(2);
    expect(f.thin).toBeLessThan(4.5);
    expect(f.stem / f.thin).toBeGreaterThan(1.8);
  });

  it('reads ink the same on toned paper and in coloured ink', () => {
    const word = drawWord({ stem: 6, foot: 3 });
    const rgba = (paper: number[], ink: number[]) => {
      const out = new Uint8ClampedArray(word.width * word.height * 4);
      for (let i = 0; i < word.data.length; i++) {
        const c = word.data[i] ? ink : paper;
        out.set([c[0], c[1], c[2], 255], i * 4);
      }
      return inkFromRgba(out, word.width, word.height);
    };
    const white = wordFeatures(rgba([255, 255, 255], [0, 0, 0]))!;
    const toned = wordFeatures(rgba([236, 228, 210], [30, 40, 140]))!;
    expect(toned.stem).toBeCloseTo(white.stem, 1);
    expect(toned.xHeight).toBeCloseTo(white.xHeight, 1);
    expect(toned.feet).toEqual(white.feet.map((v) => expect.closeTo(v, 2)));
  });
});

describe('ScanFontStyle: deciding a line style', () => {
  // Candidate widths: proportional fonts make "ill" narrow and "mum" wide; Courier does not.
  const widthOf: WidthOf = (text, family) => {
    if (family === 'mono') return text.length * 60;
    const k = family === 'serif' ? 1 : 1.08;
    return [...text].reduce((s, ch) => s + k * (/[iljtf.,:]/.test(ch) ? 28 : /[mwMW]/.test(ch) ? 85 : 55), 0);
  };
  const word = (text: string, inkWidth: number, f: Partial<MeasuredWord['features']> = {}): MeasuredWord => ({
    text,
    inkWidth,
    features: { xHeight: 40, slant: 0, stem: 6, thin: 3, feet: [0, 0, 0], ...f },
  });
  const line = (family: ScanFamily, f: Partial<MeasuredWord['features']> = {}) =>
    ['million', 'summit', 'tilt', 'minimum'].map((t) => word(t, widthOf(t, family, false, false) * 0.5, f));

  it('reads plain upright sans-serif', () => {
    expect(decideStyle(line('sans'), widthOf)).toEqual({ family: 'sans', bold: false, italic: false });
  });

  it('reads serif from feet, and italic serif from faint feet with high contrast', () => {
    expect(decideStyle(line('serif', { feet: [0.07, 0.08, 0.06] }), widthOf)?.family).toBe('serif');
    expect(decideStyle(line('serif', { feet: [0.02, 0.02, 0.02], thin: 3.5, slant: 12 }), widthOf)).toEqual({ family: 'serif', bold: false, italic: true });
    // The same faint feet with even strokes are a flared sans-serif (Candara, Optima).
    expect(decideStyle(line('sans', { feet: [0.02, 0.02, 0.02], thin: 5.5 }), widthOf)?.family).toBe('sans');
  });

  it('asks bold faces for more contrast before calling them serif', () => {
    // Bold sans thins out where strokes join: contrast 1.6 is not enough on its own.
    expect(decideStyle(line('sans', { stem: 11, thin: 6.8, feet: [0.02, 0.02, 0.02] }), widthOf)).toEqual({ family: 'sans', bold: true, italic: false });
    expect(decideStyle(line('serif', { stem: 11, thin: 4, feet: [0.02, 0.02, 0.02] }), widthOf)).toEqual({ family: 'serif', bold: true, italic: false });
  });

  it('recognises monospaced type from the words widths', () => {
    expect(decideStyle(line('mono'), widthOf)?.family).toBe('mono');
    // A proportional line is not mistaken for it.
    expect(decideStyle(line('serif', { feet: [0.07, 0.07, 0.07] }), widthOf)?.family).toBe('serif');
  });

  it('leaves figures out of the width and serif checks', () => {
    // Figures are equally wide in every font and a "2" has a wide base: they must not make a
    // sans-serif line look monospaced or serif.
    const words = [...line('sans'), word('12,450.00', 9 * 30, { feet: [0.3, 0.3] }), word('2025', 4 * 30, { feet: [0.3] })];
    expect(decideStyle(words, widthOf)?.family).toBe('sans');
  });

  it('measures the weight of capitals against the cap height', () => {
    // "INVOICE": the band measured is the cap height (57 px for a 40 px x-height). A 7 px
    // stroke is regular there, although 7 / 40 would count as bold in lowercase.
    expect(decideStyle([word('INVOICE', 300, { xHeight: 57, stem: 7 })], widthOf)?.bold).toBe(false);
    expect(decideStyle([word('invoice', 300, { xHeight: 40, stem: 9 })], widthOf)?.bold).toBe(true);
    expect(decideStyle([word('INVOICE', 300, { xHeight: 57, stem: 13 })], widthOf)?.bold).toBe(true);
  });

  it('gives up when nothing could be measured', () => {
    expect(decideStyle([], widthOf)).toBeNull();
  });
});

describe('ScanFontStyle: font names', () => {
  it('maps every detected style to the matching standard font and back', () => {
    const expected: Record<ScanFamily, string> = { serif: 'Times', sans: 'Helvetica', mono: 'Courier' };
    for (const family of ['serif', 'sans', 'mono'] as const)
      for (const bold of [false, true])
        for (const italic of [false, true]) {
          const s: ScanStyle = { family, bold, italic };
          const { realFontName, generic } = styleFontName(s);
          const f = resolvePdfFont(realFontName, generic);
          expect({ family: f.family, bold: f.bold, italic: f.italic }).toEqual({ family: expected[family], bold, italic });
          expect(f.originalName).toMatch(/^Scanned text: /);
        }
  });
});

describe('Recognised (OCR) lines in the editor', () => {
  // OCR words of an italic line: slanted letters make the word boxes touch or overlap.
  const font = styleFontName({ family: 'serif', bold: false, italic: true });
  const ocrWord = (str: string, x: number, width: number): RawTextItem => ({
    str, x, width, baseline: 300, fontSize: 18, fontName: 'ocr', ...font, ascent: 0.9, descent: -0.25, angle: 0,
  });
  const items = [ocrWord('Please', 100, 52), ocrWord('pay', 151, 30), ocrWord('within', 184, 50), ocrWord('fifteen', 236, 52)];

  it('keeps the spaces between recognised words even when their boxes touch', () => {
    expect(buildLines(items, 0)[0].text).toBe('Please pay within fifteen');
  });

  it('draws edited recognised text in the style detected on the scan', () => {
    const para = groupParagraphs(buildLines(items, 0), 0, 800)[0];
    const edit = createTextEdit(para, { background: '#f4f1ea', text: '#1a1a1a' }, 'e1');
    expect(edit.style).toMatchObject({ fontFamily: 'Times', bold: false, italic: true });
    expect(edit.ocr).toBe(true);
    expect(edit.origFontName).toBe('Scanned text: serif, italic');
  });

  it('keeps plain sans-serif for recognised text whose style was not detected', () => {
    const plain = items.map((i) => ({ ...i, realFontName: undefined, generic: 'sans-serif' }));
    const para = groupParagraphs(buildLines(plain, 0), 0, 800)[0];
    expect(createTextEdit(para, { background: '#fff', text: '#000' }, 'e2').style).toMatchObject({ fontFamily: 'Helvetica', bold: false, italic: false });
  });
});

describe('ScanFontStyle: a whole scanned line', () => {
  const page = (): PagePixels => {
    const width = 1400;
    const height = 120;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) data.set([240, 236, 226, 255], i * 4); // toned paper
    return { width, height, data };
  };
  // Widths as if every word were set in the font being tested (these words are all "n"s).
  const sameWidth: WidthOf = (text) => text.length;
  const place = (p: PagePixels, g: Glyphs, texts: string[]) => {
    let x = 20;
    return texts.map((text) => {
      const w = drawWord({ ...g, letters: text.length }, { page: p, x, y: 30, ink: [25, 30, 110] });
      const word = { text, x0: x, y0: 30, x1: x + w.width, y1: 30 + w.height };
      x += w.width + 30;
      return word;
    });
  };

  it('finds serif, bold and italic on the page', () => {
    const p = page();
    const words = place(p, { stem: 11, foot: 5, shear: 0.22 }, ['nnnn', 'nnnnn', 'nnn']);
    expect(detectLineStyle(p, words, sameWidth)).toEqual({ family: 'serif', bold: true, italic: true });
  });

  it('finds plain sans-serif on the page', () => {
    const p = page();
    const words = place(p, { stem: 6 }, ['nnnn', 'nnnnn', 'nnn']);
    expect(detectLineStyle(p, words, sameWidth)).toEqual({ family: 'sans', bold: false, italic: false });
  });

  it('skips words it cannot measure, and lines without Latin words', () => {
    const p = page();
    expect(detectLineStyle(p, [{ text: 'धन्यवाद', x0: 20, y0: 30, x1: 200, y1: 80 }], sameWidth)).toBeNull();
    expect(detectLineStyle(p, [{ text: 'nn', x0: 20, y0: 30, x1: 24, y1: 33 }], sameWidth)).toBeNull();
  });
});
