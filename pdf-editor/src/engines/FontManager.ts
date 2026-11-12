/**
 * Font registry and font resolution.
 *
 * PDF.js does not hand out the original embedded font programs (and embedded fonts are
 * usually subsets that lack the glyphs for new text), so edited text is drawn with:
 *   1. a font the user uploaded (TTF/OTF) whose name matches, else
 *   2. the closest of the standard PDF fonts (Helvetica / Times / Courier).
 * resolvePdfFont() reports which of those happened so the UI can warn honestly.
 */

export interface FontFamilyDef {
  id: string;
  label: string;
  css: string;
  custom?: { bytes: Uint8Array; name: string };
  /** Shipped with the app and embedded from a font file (loaded on demand). */
  bundled?: boolean;
}

/** Bundled Unicode font: Latin, Latin Extended, Cyrillic, Greek, Devanagari, currency signs. */
export const FALLBACK_FONT_ID = 'NotoSans';
export const FALLBACK_CSS_NAME = 'PdfEd Noto Sans';

const STANDARD: FontFamilyDef[] = [
  { id: 'Helvetica', label: 'Helvetica (Arial)', css: 'Arial, Helvetica, "Liberation Sans", sans-serif' },
  { id: 'Times', label: 'Times', css: '"Times New Roman", Times, "Liberation Serif", serif' },
  { id: 'Courier', label: 'Courier', css: '"Courier New", Courier, "Liberation Mono", monospace' },
  { id: FALLBACK_FONT_ID, label: 'Noto Sans (Unicode)', css: `"${FALLBACK_CSS_NAME}", "Noto Sans", Arial, sans-serif`, bundled: true },
];

type BundledLoader = (bold: boolean, italic: boolean) => Promise<Uint8Array>;
let bundledLoader: BundledLoader | null = null;
const bundledCache = new Map<number, Promise<Uint8Array>>();

/** Tells the manager how to read the bundled font files (fetch in the browser, fs in tests). */
export function setBundledFontLoader(loader: BundledLoader | null) {
  bundledLoader = loader;
  bundledCache.clear();
}
export const hasBundledFont = () => bundledLoader !== null;

export function loadBundledFont(bold: boolean, italic: boolean): Promise<Uint8Array> {
  if (!bundledLoader) return Promise.reject(new Error('The bundled Unicode font is not available.'));
  const key = (bold ? 1 : 0) + (italic ? 2 : 0);
  let p = bundledCache.get(key);
  if (!p) {
    p = bundledLoader(bold, italic);
    p.catch(() => bundledCache.delete(key));
    bundledCache.set(key, p);
  }
  return p;
}

const custom = new Map<string, FontFamilyDef>();
let counter = 0;

export const listFonts = (): FontFamilyDef[] => [...STANDARD, ...custom.values()];
export const getFont = (id: string): FontFamilyDef => custom.get(id) ?? STANDARD.find((f) => f.id === id) ?? STANDARD[0];
export const cssFamily = (id: string): string => getFont(id).css;
export const isCustomFont = (id: string): boolean => custom.has(id);

const normalize = (name: string) => name.replace(/^[A-Z]{6}\+/, '').replace(/[\s_,-]/g, '').toLowerCase();

/** Registers a user-supplied TTF/OTF for both on-screen rendering and PDF embedding. */
export async function registerCustomFont(file: File): Promise<FontFamilyDef> {
  return registerCustomFontBytes(file.name.replace(/\.(ttf|otf)$/i, ''), new Uint8Array(await file.arrayBuffer()));
}

/** Uploaded fonts with their bytes, so auto-save can keep them with the document. */
export const listCustomFonts = (): FontFamilyDef[] => [...custom.values()];

export async function registerCustomFontBytes(name: string, bytes: Uint8Array): Promise<FontFamilyDef> {
  const tag = String.fromCharCode(...bytes.slice(0, 4));
  const isTtf = bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0;
  if (!isTtf && tag !== 'OTTO' && tag !== 'true') {
    throw new Error(`"${name}" is not a TrueType or OpenType font (.ttf / .otf).`);
  }
  const cssName = `pdfed-font-${++counter}`;
  if (typeof FontFace !== 'undefined') {
    const face = new FontFace(cssName, bytes.slice().buffer);
    await face.load().catch(() => {
      throw new Error(`"${name}" could not be loaded as a font.`);
    });
    document.fonts.add(face);
  }
  const def: FontFamilyDef = { id: `custom:${name}`, label: name, css: `"${cssName}", sans-serif`, custom: { bytes, name } };
  custom.set(def.id, def);
  return def;
}

export interface ResolvedFont {
  family: string;
  bold: boolean;
  italic: boolean;
  match: 'standard' | 'custom' | 'substituted';
  originalName: string;
}

const STANDARD_NAMES = /^(helvetica|arial|arialmt|times|timesnewroman|timesnewromanps|courier|couriernew|couriernewps)/;

/** Maps the font of existing PDF text to something we can actually draw with. */
export function resolvePdfFont(realName: string | undefined, generic: string): ResolvedFont {
  const clean = (realName ?? '').replace(/^[A-Z]{6}\+/, '');
  const n = normalize(clean);
  const bold = /bold|black|heavy|semibold|demi/.test(n);
  const italic = /italic|oblique/.test(n);
  const originalName = clean || `unknown ${generic} font`;

  for (const f of custom.values()) {
    const cn = normalize(f.custom!.name);
    if (n && (n.startsWith(cn) || cn.startsWith(n.replace(/(bold|italic|oblique|regular|mt|ps)+$/g, '')))) {
      return { family: f.id, bold, italic, match: 'custom', originalName };
    }
  }

  let family = 'Helvetica';
  if (/courier|mono|consol|typewriter/.test(n) || generic === 'monospace') family = 'Courier';
  else if (/times|georgia|garamond|serif|roman|cambria|palatino|minion|book/.test(n) && !/sans/.test(n)) family = 'Times';
  else if (!n && generic === 'serif') family = 'Times';
  else if (generic === 'serif' && !/arial|helvetica|sans|verdana|tahoma|calibri|segoe|roboto/.test(n)) family = 'Times';

  return { family, bold, italic, match: STANDARD_NAMES.test(n) ? 'standard' : 'substituted', originalName };
}
