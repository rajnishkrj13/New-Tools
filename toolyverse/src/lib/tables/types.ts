/**
 * Tables as the document tools see them, whatever they came from (a PDF's text and lines, OCR of a
 * scan, a Word file). Positions are PDF points with y growing downwards from the top of the page.
 */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A piece of text with its place on the page. */
export interface Word {
  text: string;
  box: Box;
  /** Text size in points. */
  size: number;
  bold?: boolean;
  /** OCR certainty 0–100; absent for text read from the PDF itself. */
  conf?: number;
}

/** A straight horizontal or vertical line drawn on the page (table rules and borders). */
export interface Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Cell {
  text: string;
  rowSpan: number;
  colSpan: number;
  /** Covered by a merged cell to its left or above; holds no text. */
  hidden?: boolean;
  /** Where the text was on the page, to show the source of a value. */
  box?: Box;
  /** How sure the extraction is about this cell, 0–100, from OCR scores and layout signals. */
  conf?: number;
  bold?: boolean;
  /** Link target (Word files). */
  link?: string;
}

export type Method = 'ruled' | 'ruled-partial' | 'aligned' | 'scan-ruled' | 'scan-aligned' | 'word';

export interface Confidence {
  /** That this region is a table at all. */
  table: number;
  /** That the rows were found correctly. */
  rows: number;
  /** That the columns were found correctly. */
  cols: number;
  /** Lowest cell confidence. */
  cells: number;
}

export interface Table {
  id: string;
  name: string;
  /** Pages (0-based) the table covers, in order. */
  pages: number[];
  /** Position on its first page. */
  box: Box;
  /** Row-major grid; every row has the same number of cells (hidden ones under merged cells). */
  rows: Cell[][];
  /** How many leading rows are headings. */
  headerRows: number;
  method: Method;
  confidence: Confidence;
  /** Plain-language notes about how the table was read. */
  notes: string[];
  /** Page each row came from, for tables joined across pages. */
  rowPages?: number[];
  /** Column edges on the page (left of each column, then the right edge), to match tables across pages. */
  colX?: number[];
  /** Right-to-left table: columns are in reading order, the first one is rightmost on the page. */
  rtl?: boolean;
}

export const cell = (text: string, extra: Partial<Cell> = {}): Cell => ({ text, rowSpan: 1, colSpan: 1, ...extra });

export const colCount = (t: Table) => t.rows[0]?.length ?? 0;

export const unionBox = (boxes: Box[]): Box => ({
  x0: Math.min(...boxes.map((b) => b.x0)),
  y0: Math.min(...boxes.map((b) => b.y0)),
  x1: Math.max(...boxes.map((b) => b.x1)),
  y1: Math.max(...boxes.map((b) => b.y1)),
});
