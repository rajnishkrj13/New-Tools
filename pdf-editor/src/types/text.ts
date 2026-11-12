/** One text item from PDF.js, already converted to view space. */
export interface RawTextItem {
  str: string;
  x: number;
  baseline: number;
  width: number;
  fontSize: number;
  /** PDF.js internal font id (g_d0_f1 ...). */
  fontName: string;
  /** Real PostScript name when PDF.js exposes it (may carry a subset prefix). */
  realFontName?: string;
  /** Generic CSS family reported by PDF.js: serif, sans-serif, monospace. */
  generic: string;
  ascent: number;
  descent: number;
  /** Text direction in view space, degrees. Only ~0 is editable in place. */
  angle: number;
}

export interface TextSegment {
  str: string;
  x: number;
  width: number;
  /** Index of the segment's first character inside line.text. */
  start: number;
}

export interface TextLine {
  id: string;
  pageIndex: number;
  text: string;
  x: number;
  right: number;
  baseline: number;
  top: number;
  bottom: number;
  fontSize: number;
  fontName: string;
  realFontName?: string;
  generic: string;
  segments: TextSegment[];
  /** False when character boundaries cannot be trusted; letter editing falls back to words. */
  reliableChars: boolean;
  charX?: number[];
}

export interface Paragraph {
  id: string;
  pageIndex: number;
  lines: TextLine[];
  left: number;
  right: number;
  /** Right edge that edited text may flow to. */
  maxRight: number;
  lineGap: number;
  fontSize: number;
  spaceBelow: number;
  soft: boolean[];
}

export interface PageTextModel {
  pageIndex: number;
  lines: TextLine[];
  paragraphs: Paragraph[];
  /** Number of text items skipped because they are rotated or vertical. */
  skipped: number;
}

export type EditLevel = 'word' | 'line' | 'char';

export interface TextSelection {
  pageIndex: number;
  paragraphId: string;
  slot: number;
  start: number;
  end: number;
  editing: boolean;
}
