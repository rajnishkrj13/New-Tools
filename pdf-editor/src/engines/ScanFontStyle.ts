/**
 * Recognises the look of scanned text: serif, sans-serif or monospace, bold, italic.
 *
 * OCR reads the letters but not the typeface, so edited text on a scan used to come out in
 * Helvetica whatever the page looked like. This measures each printed line the way a
 * typographer would, without assuming any particular font:
 *   - slant: the shear that makes the vertical strokes line up (italic leans 5-20 degrees);
 *   - weight: the width of vertical strokes relative to the x-height (bold is about 1.5x);
 *   - serifs: whether the ink at the foot of a stroke is wider than the stroke itself;
 *   - monospacing: whether the words' widths keep the proportions of a monospaced font.
 * The result picks the closest font the editor can draw with (Times, Helvetica or Courier,
 * regular / bold / italic). Measuring is pure; only the candidate word widths need a canvas.
 */

export type ScanFamily = 'serif' | 'sans' | 'mono';
export interface ScanStyle {
  family: ScanFamily;
  bold: boolean;
  italic: boolean;
}

/** CSS fonts that draw like the PDF standard fonts the edited text is exported with. */
export const SCAN_FAMILY_CSS: Record<ScanFamily, string> = {
  serif: '"Times New Roman", Times, "Liberation Serif", serif',
  sans: 'Arial, Helvetica, "Liberation Sans", sans-serif',
  mono: '"Courier New", Courier, "Liberation Mono", monospace',
};

/** Decision thresholds, from measuring 40+ regular, bold and italic system fonts. */
export const ITALIC_DEGREES = 3;
export const BOLD_STEM = 0.2;
/** Feet reaching this far beyond their strokes (in x-heights) are serifs. Sans faces: about 0. */
export const SERIF_FOOT = 0.035;
/**
 * Fainter feet still mean serifs when thick and thin strokes contrast this much (italic serif
 * faces). Bold sans faces thin out where strokes join, so bold needs more contrast.
 */
export const FAINT_FOOT = 0.008;
export const SERIF_CONTRAST = 1.4;
export const SERIF_CONTRAST_BOLD = 2;
/** Words of capitals or figures: the band measured is the cap height, about 1.4 x-heights. */
const CAPS_TO_X = 0.7;

/** Ink coverage, 0 (paper) to 1 (ink), row by row. */
export interface InkMap {
  width: number;
  height: number;
  data: Float32Array;
}

/**
 * Ink of an RGBA area (canvas pixels), independent of paper tone and ink colour: the
 * lightest pixels count as paper and the darkest as full ink.
 */
export function inkFromRgba(rgba: Uint8ClampedArray, width: number, height: number): InkMap {
  const lum = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i++) lum[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  const sorted = Float32Array.from(lum).sort();
  const paper = sorted[Math.floor(sorted.length * 0.9)] ?? 255;
  // Full ink: the dark end of the pixels that are clearly not paper, however few there are.
  let dark = 0;
  while (dark < sorted.length && sorted[dark] < paper - 40) dark++;
  const ink = dark ? sorted[Math.floor(dark * 0.1)] : sorted[0];
  const span = Math.max(40, paper - ink);
  const data = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i++) {
    const v = (paper - lum[i]) / span;
    data[i] = v < 0.25 ? 0 : Math.min(1, v);
  }
  return { width, height, data };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tight box around the ink, ignoring rows and columns with only a speck of it. */
export function inkBox(m: InkMap): Box | null {
  const rows = new Float32Array(m.height);
  const cols = new Float32Array(m.width);
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++) {
      const v = m.data[y * m.width + x];
      rows[y] += v;
      cols[x] += v;
    }
  const edge = (a: Float32Array) => {
    const peak = Math.max(...a);
    if (peak <= 0) return null;
    const min = Math.max(0.5, peak * 0.04);
    let lo = 0;
    let hi = a.length - 1;
    while (lo < hi && a[lo] < min) lo++;
    while (hi > lo && a[hi] < min) hi--;
    return [lo, hi] as const;
  };
  const r = edge(rows);
  const c = edge(cols);
  if (!r || !c) return null;
  return { x: c[0], y: r[0], width: c[1] - c[0] + 1, height: r[1] - r[0] + 1 };
}

// ---- typographic measurements --------------------------------------------------------------

/** Measurements of one printed word that do not depend on any reference font. */
export interface WordFeatures {
  /** Height of the lowercase band (or of the capitals in an all-caps word), pixels. */
  xHeight: number;
  /** Lean of the letters, degrees (about 0 upright, 10-20 italic). */
  slant: number;
  /** Width of vertical strokes, pixels. */
  stem: number;
  /** Thickness of horizontal strokes (arches, bowls, bars), pixels; NaN when there are none. */
  thin: number;
  /**
   * For each vertical stroke that reaches the baseline: how far the ink at its foot reaches
   * beyond the stroke, in x-heights. About 0 without serifs, 0.04-0.1 with.
   */
  feet: number[];
}

/** Ink runs (start, length) along one row of a binary picture. */
function runsOf(row: (x: number) => boolean, width: number): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let x = 0; x <= width; x++) {
    const on = x < width && row(x);
    if (on && start < 0) start = x;
    else if (!on && start >= 0) {
      out.push([start, x - start]);
      start = -1;
    }
  }
  return out;
}

const median = (v: number[]) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function wordFeatures(m: InkMap): WordFeatures | null {
  const box = inkBox(m);
  if (!box || box.height < 8 || box.width < 8) return null;
  const val = (x: number, y: number) => (x >= 0 && y >= 0 && x < m.width && y < m.height ? m.data[y * m.width + x] : 0);
  const on = (x: number, y: number) => val(x, y) >= 0.5;

  // The lowercase band: where the rows hold at least half the ink of the fullest row. The
  // edges are interpolated between rows, so small text is measured to a fraction of a pixel.
  const g: number[] = [];
  for (let y = box.y; y < box.y + box.height; y++) {
    let n = 0;
    for (let x = box.x; x < box.x + box.width; x++) n += val(x, y);
    g.push(n);
  }
  const half = Math.max(...g) * 0.5;
  const i = g.findIndex((n) => n >= half);
  const j = g.length - 1 - [...g].reverse().findIndex((n) => n >= half);
  const topEdge = i > 0 ? i - 0.5 + (half - g[i - 1]) / (g[i] - g[i - 1]) : 0;
  const bottomEdge = j < g.length - 1 ? j + 0.5 + (g[j] - half) / (g[j] - g[j + 1]) : g.length;
  const xHeight = bottomEdge - topEdge;
  const top = box.y + i;
  const bottom = box.y + j;
  if (xHeight < 6) return null;

  // Slant: the shear that makes vertical strokes line up best (sharpest column profile).
  let best = -Infinity;
  let shear = 0;
  for (let t = -0.15; t <= 0.5001; t += 0.025) {
    const cols = new Map<number, number>();
    for (let y = top; y <= bottom; y++)
      for (let x = box.x; x < box.x + box.width; x++)
        if (on(x, y)) {
          const k = Math.round(x - (bottom - y) * t);
          cols.set(k, (cols.get(k) ?? 0) + 1);
        }
    let sq = 0;
    for (const c of cols.values()) sq += c * c;
    if (sq > best) ((best = sq), (shear = t));
  }
  // Coordinates with the slant taken out.
  const sx = (x: number, y: number) => Math.round(x + (bottom - y) * shear);
  const at = (x: number, y: number) => on(sx(x, y), y);
  const inkAt = (x: number, y: number) => val(sx(x, y), y);
  /** Ink across [l, r] of a row, partial pixels included: a width to a fraction of a pixel. */
  const widthAt = (l: number, r: number, y: number) => {
    let w = 0;
    for (let x = l - 1; x <= r + 1; x++) w += inkAt(x, y);
    return w;
  };

  // Stems: ink runs across the middle of the band; those that go straight down to the baseline
  // are vertical strokes, and the ink at their foot tells whether they end in serifs.
  const mid = Math.round(top + (bottom - top) * 0.5);
  const span = box.x + box.width + Math.ceil((bottom - top) * Math.abs(shear)) + 2;
  const stemWidths: number[] = [];
  const feet: number[] = [];
  for (const [x0, len] of runsOf((x) => at(x, mid), span)) {
    const stem = (widthAt(x0, x0 + len - 1, mid - 1) + widthAt(x0, x0 + len - 1, mid) + widthAt(x0, x0 + len - 1, mid + 1)) / 3;
    stemWidths.push(stem);
    const cx = x0 + Math.floor(len / 2);
    let straight = true;
    for (let y = mid; y <= bottom && straight; y++) straight = at(cx, y);
    if (!straight || len > xHeight * 0.45) continue;
    const footRow = bottom - Math.max(0, Math.round(xHeight * 0.04));
    let l = cx;
    let r = cx;
    while (at(l - 1, footRow) && cx - l < xHeight) l--;
    while (at(r + 1, footRow) && r - cx < xHeight) r++;
    feet.push((widthAt(l, r, footRow) - stem) / xHeight);
  }
  if (!stemWidths.length) return null;

  // Thin strokes: short vertical ink runs inside the band (tops of arches, bowls, bars).
  const thins: number[] = [];
  const left = box.x - Math.ceil((bottom - top) * Math.abs(shear)) - 2;
  for (let x = left; x < span; x++) {
    let start = -1;
    for (let y = top - 1; y <= bottom + 2; y++) {
      const ink = y <= bottom + 1 && at(x, y);
      if (ink && start < 0) start = y;
      else if (!ink && start >= 0) {
        const len = y - start;
        if (start > top - 1 && y <= bottom + 1 && len <= xHeight * 0.35) {
          let t = 0;
          for (let k = start - 1; k <= y; k++) t += inkAt(x, k);
          thins.push(t);
        }
        start = -1;
      }
    }
  }
  return { xHeight, slant: (Math.atan(shear) * 180) / Math.PI, stem: median(stemWidths), thin: median(thins), feet };
}

/** Words worth measuring: Latin letters and digits, 2+ of them. */
export const comparable = (text: string) => text.replace(/[^A-Za-z0-9]/g, '').length >= 2 && /^[\x20-\x7e\u00a0-\u017f]+$/.test(text);

/** A printed word with its measurements. */
export interface MeasuredWord {
  text: string;
  features: WordFeatures;
  /** Width of the printed ink, pixels. */
  inkWidth: number;
}

/** Width of `text` drawn in a family and style, any unit (only ratios between words are used). */
export type WidthOf = (text: string, family: ScanFamily, bold: boolean, italic: boolean) => number;

const stdDev = (v: number[]) => {
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  return Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
};

/** Stroke width relative to the x-height; words without lowercase are measured on capitals. */
export const weightOf = (w: MeasuredWord) => (w.features.stem / w.features.xHeight) * (/[a-z]/.test(w.text) ? 1 : 1 / CAPS_TO_X);

/**
 * The style of a line from its measured words. Null when nothing could be measured.
 * Pure: `widthOf` supplies the widths of the candidate fonts.
 */
export function decideStyle(words: MeasuredWord[], widthOf: WidthOf): ScanStyle | null {
  if (!words.length) return null;
  const italic = median(words.map((w) => w.features.slant)) >= ITALIC_DEGREES;
  const bold = median(words.map(weightOf)) >= BOLD_STEM;

  // How far the printed widths stray from the proportions of a candidate font. Figures are
  // left out: they are equally wide in most fonts, so they say nothing about the font.
  const worded = words.filter((w) => w.text.replace(/[^A-Za-z]/g, '').length >= 2);
  const spread = (f: ScanFamily) => stdDev(worded.map((w) => Math.log(w.inkWidth / Math.max(1e-6, widthOf(w.text, f, bold, italic)))));

  // Monospaced type keeps Courier's proportions much better than any proportional font's.
  if (worded.length >= 2) {
    const mono = spread('mono');
    const proportional = Math.min(spread('serif'), spread('sans'));
    if (mono < proportional * 0.6 && proportional - mono > 0.03) return { family: 'mono', bold, italic };
  }

  // Serifs: the feet of all the line's strokes together (figures left out: a 2 or a 1 has a
  // wide base in any font), and the contrast between thick and thin strokes.
  const feet = worded.flatMap((w) => w.features.feet);
  if (feet.length >= 3) {
    const reach = median(feet);
    const contrast = median(worded.map((w) => w.features.stem / w.features.thin).filter(Number.isFinite));
    const serif = reach >= SERIF_FOOT || (reach >= FAINT_FOOT && contrast >= (bold ? SERIF_CONTRAST_BOLD : SERIF_CONTRAST));
    return { family: serif ? 'serif' : 'sans', bold, italic };
  }
  // No vertical strokes to look at (round letters only): the widths decide between the two.
  if (worded.length >= 2) return { family: spread('serif') < spread('sans') ? 'serif' : 'sans', bold, italic };
  return { family: 'sans', bold, italic };
}

/** Font name given to recognised text, which FontManager.resolvePdfFont turns back into a style. */
export function styleFontName(s: ScanStyle): { realFontName: string; generic: string } {
  const family = s.family === 'serif' ? 'serif' : s.family === 'mono' ? 'monospace' : 'sans-serif';
  const extras = [s.bold && 'bold', s.italic && 'italic'].filter(Boolean).join(' ');
  return { realFontName: `Scanned text: ${family}${extras ? `, ${extras}` : ''}`, generic: family };
}

// ---- the page ------------------------------------------------------------------------------

/** RGBA pixels of a rendered page (a canvas ImageData). */
export interface PagePixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface ScanWord {
  text: string;
  /** Box of the word on the page, pixels. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

let measurer: CanvasRenderingContext2D | null = null;

/** Ink width of text in a candidate font, from canvas text metrics (nothing is drawn). */
export const canvasWidthOf: WidthOf = (text, family, bold, italic) => {
  if (typeof document === 'undefined') return 1;
  measurer ??= document.createElement('canvas').getContext('2d');
  if (!measurer) return 1;
  measurer.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}100px ${SCAN_FAMILY_CSS[family]}`;
  const m = measurer.measureText(text);
  return m.actualBoundingBoxLeft + m.actualBoundingBoxRight || m.width;
};

/** Measures one printed word on the page. */
export function measureWord(page: PagePixels, w: ScanWord): MeasuredWord | null {
  const pad = 2;
  const x = Math.max(0, Math.floor(w.x0) - pad);
  const y = Math.max(0, Math.floor(w.y0) - pad);
  const width = Math.min(page.width - x, Math.ceil(w.x1 - w.x0) + 2 * pad);
  const height = Math.min(page.height - y, Math.ceil(w.y1 - w.y0) + 2 * pad);
  if (width < 8 || height < 8) return null;
  const crop = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * page.width + x) * 4;
    crop.set(page.data.subarray(from, from + width * 4), row * width * 4);
  }
  const ink = inkFromRgba(crop, width, height);
  const box = inkBox(ink);
  const features = wordFeatures(ink);
  return box && features ? { text: w.text, features, inkWidth: box.width } : null;
}

/**
 * The style of one printed line, from up to `maxWords` of its longer Latin words.
 * Null when there is nothing to measure (no such words, or the text is too small).
 */
export function detectLineStyle(page: PagePixels, words: ScanWord[], widthOf: WidthOf = canvasWidthOf, maxWords = 8): ScanStyle | null {
  const measured = words
    .filter((w) => comparable(w.text))
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, maxWords)
    .map((w) => measureWord(page, w))
    .filter((w): w is MeasuredWord => !!w);
  return decideStyle(measured, widthOf);
}
