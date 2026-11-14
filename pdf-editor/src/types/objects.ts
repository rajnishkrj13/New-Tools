export type TextAlign = 'left' | 'center' | 'right';

export interface TextStyle {
  /** Font family id from FontManager ("Helvetica", "Times", "Courier" or "custom:<name>"). */
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  align: TextAlign;
  opacity: number;
}

interface BaseObject {
  id: string;
  pageIndex: number;
  /** Objects created together on several pages (header, footer, watermark) share a group id. */
  groupId?: string;
}

/** A new text box added by the user. x/y is the top-left corner; rotation is clockwise degrees about it. */
export interface TextObject extends BaseObject, TextStyle {
  type: 'text';
  x: number;
  y: number;
  width: number;
  rotation: number;
  text: string;
  /**
   * Formatting marks are applied: lines starting with "- " or "1. " are list items,
   * **text** is bold and *text* is italic.
   */
  rich?: boolean;
  /** {page}, {pages}, {date} and {file} in the text are filled in for each page. */
  fields?: boolean;
  /** Border drawn around the text (stamps). */
  frame?: { color: string; width: number; padding: number };
}

/** A clickable area that opens a web address or jumps to a page. */
export interface LinkObject extends BaseObject {
  type: 'link';
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
  /** Page (by id) to jump to instead of opening `url`. */
  targetPageId?: string | null;
  /** The link of the original PDF this one replaces (its annotation reference). */
  sourceRef?: string;
  /** With `sourceRef`: the original link is deleted. */
  removed?: boolean;
}

/** A sticky-note comment. width/height are the size of its icon. */
export interface NoteObject extends BaseObject {
  type: 'note';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  author: string;
  color: string;
  replies: { author: string; text: string }[];
}

/** A new fillable form field. */
export interface FieldObject extends BaseObject {
  type: 'field';
  kind: 'text' | 'checkbox';
  /** Field name inside the PDF form; must be unique in the document. */
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
  checked: boolean;
  fontSize: number;
}

export interface ImageObject extends BaseObject {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  assetId: string;
  keepRatio: boolean;
  signature?: boolean;
}

export interface BoxShapeObject extends BaseObject {
  type: 'rect' | 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  opacity: number;
}

export interface LineObject extends BaseObject {
  type: 'line' | 'arrow';
  points: [number, number, number, number];
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

export interface PathObject extends BaseObject {
  type: 'path';
  points: number[];
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

/** whiteout = opaque cover drawn on top. redact = page is flattened to an image on export. */
export interface MaskObject extends BaseObject {
  type: 'whiteout' | 'redact';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
}

/**
 * A table added by the user. x/y is the top-left corner. `colW` and `rowH` are shares of the
 * width and height (each sums to 1); a row grows when its text needs more room.
 */
export interface TableObject extends BaseObject {
  type: 'table';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** Text of every cell, by row then column. */
  cells: string[][];
  colW: number[];
  rowH: number[];
  style: TextStyle;
  /** The first row is a header: bold on a filled background. */
  headerRow: boolean;
  headerFill: string;
  /** Background of the cells; null lets the page show through. */
  fill: string | null;
  borderColor: string;
  borderWidth: number;
}

export type MarkMode = 'highlight' | 'underline' | 'strike';

/** Band of one marked text line in view space; `base` is the baseline measured from `y`. */
export interface MarkRect {
  x: number;
  y: number;
  width: number;
  height: number;
  base: number;
}

/** Highlight, underline or strikethrough over text. It is tied to its text and cannot be moved. */
export interface HighlightObject extends BaseObject {
  type: 'highlight';
  mode: MarkMode;
  rects: MarkRect[];
  color: string;
  opacity: number;
}

/**
 * A picture of the original PDF that was taken out of its page (to be moved, resized,
 * replaced or deleted). On screen it is covered; on export its paint operator is removed.
 */
export interface ImageCutObject extends BaseObject {
  type: 'imagecut';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** Paper colour used to cover the picture. */
  fill: string;
  /** Identity of the picture on its page. */
  key: string;
  /** Which image paint operator of the page this is (-1: not removable), and how many the page has. */
  seq: number;
  total: number;
}

/** Geometry of one original text line, kept so the original layout is never lost. */
export interface OrigLine {
  text: string;
  x: number;
  right: number;
  baseline: number;
  top: number;
  bottom: number;
  fontSize: number;
  /** x of every character boundary (length = text.length + 1). */
  charX: number[];
}

/**
 * An edit of one existing paragraph. `orig` is the original layout model,
 * `lines`/`soft` are the edited layout model produced by the reflow engine.
 */
export interface TextEditObject extends BaseObject {
  type: 'textedit';
  paragraphId: string;
  orig: OrigLine[];
  lines: string[];
  /** soft[i] is true when the break after line i is a wrap, not a hard line end. */
  soft: boolean[];
  /** Right edge the text may flow to. */
  maxRight: number;
  lineGap: number;
  /** Free vertical space under the paragraph before the next content. */
  spaceBelow: number;
  style: TextStyle;
  /** True when the user changed the style; every line is then redrawn. */
  styled: boolean;
  /** Width correction per original line: original width / measured width. */
  calibs: number[];
  calib: number;
  maskColor: string;
  /** The text was recognised on a scanned picture (OCR): there is no real text underneath. */
  ocr?: boolean;
  origFontName: string;
  fontMatch: 'standard' | 'custom' | 'substituted';
}

export type EditorObject =
  | TextObject
  | ImageObject
  | BoxShapeObject
  | LineObject
  | PathObject
  | MaskObject
  | HighlightObject
  | TableObject
  | ImageCutObject
  | LinkObject
  | NoteObject
  | FieldObject
  | TextEditObject;

export type ObjectType = EditorObject['type'];

/** Changes to the page's own content: drawn under everything else and never selected. */
export const isPageEdit = (o: EditorObject): o is TextEditObject | ImageCutObject => o.type === 'textedit' || o.type === 'imagecut';

/** Value typed into a form field that already exists in the PDF, by field name. */
export type FormValues = Record<string, string | boolean>;

export interface ImageAsset {
  id: string;
  name: string;
  mime: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
  url: string;
  width: number;
  height: number;
}
