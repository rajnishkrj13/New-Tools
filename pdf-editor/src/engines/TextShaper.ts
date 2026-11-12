/**
 * Complex-script shaping with HarfBuzz (WebAssembly, runs locally).
 *
 * Scripts such as Devanagari (Hindi), Bengali, Tamil, Thai or Arabic cannot be drawn by
 * mapping one character to one glyph: letters join into conjuncts, vowel signs move in
 * front of the consonant, marks are positioned above or below. HarfBuzz turns a string
 * into the final glyph ids and positions; the exporter then draws exactly those glyphs.
 *
 * The library is loaded on demand, only when a document contains such text.
 */

export interface ShapedGlyph {
  /** Glyph id in the font. */
  gid: number;
  /** Position of the glyph origin relative to the start of the text, in em. */
  x: number;
  y: number;
}

export interface ShapedText {
  glyphs: ShapedGlyph[];
  /** Total advance of the text in em. */
  advance: number;
}

export interface Shaper {
  shape(fontBytes: Uint8Array, text: string): ShapedText;
}

/** Hebrew, Arabic and related (right-to-left). */
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
/** Indic scripts, Thai, Lao, Tibetan, Myanmar, Khmer. */
const COMPLEX = /[ऀ-෿฀-࿿က-႟ក-៿]/;

export const needsShaping = (text: string): boolean => COMPLEX.test(text) || RTL.test(text);
export const isRightToLeft = (text: string): boolean => RTL.test(text);

let pending: Promise<Shaper | null> | null = null;

/** Resolves to null when HarfBuzz cannot be loaded; callers then fall back to plain drawing. */
export function getShaper(): Promise<Shaper | null> {
  pending ??= import('harfbuzzjs').then(createShaper).catch(() => null);
  return pending;
}

function createShaper(hb: typeof import('harfbuzzjs')): Shaper {
  const fonts = new WeakMap<Uint8Array, { font: InstanceType<typeof hb.Font>; upem: number }>();
  return {
    shape(fontBytes, text) {
      let entry = fonts.get(fontBytes);
      if (!entry) {
        const face = new hb.Face(new hb.Blob(fontBytes));
        entry = { font: new hb.Font(face), upem: face.upem || 1000 };
        fonts.set(fontBytes, entry);
      }
      const { font, upem } = entry;
      const buffer = new hb.Buffer();
      try {
        buffer.addText(text);
        buffer.guessSegmentProperties();
        hb.shape(font, buffer);
        const infos = buffer.getGlyphInfos();
        const positions = buffer.getGlyphPositions();
        let x = 0;
        let y = 0;
        const glyphs = infos.map((g, i) => {
          const p = positions[i];
          const out = { gid: g.codepoint, x: (x + p.xOffset) / upem, y: (y + p.yOffset) / upem };
          x += p.xAdvance;
          y += p.yAdvance;
          return out;
        });
        return { glyphs, advance: x / upem };
      } finally {
        (buffer as unknown as { destroy?: () => void }).destroy?.();
      }
    },
  };
}
