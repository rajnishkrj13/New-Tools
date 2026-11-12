import type { TableObject, TextStyle } from '../types/objects';
import { BASELINE_EM, LINE_HEIGHT_EM, measureText } from '../utils/fontUtils';
import type { TextRun } from './TextEditLayout';
import { wrapText } from './TextReflowEngine';

/**
 * Layout of a table, shared by the screen renderer, the cell editor and the PDF exporter.
 * Columns share the table width by their fractions. A row is at least its share of the
 * table height and grows when the text of one of its cells needs more lines.
 */

export const CELL_PAD = 3;

export interface TableCell {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  style: TextStyle;
  /** Text lines, positioned relative to the table's top-left corner. */
  runs: TextRun[];
}

export interface TableLayout {
  /** x of every column edge (cols + 1 values) and y of every row edge (rows + 1 values). */
  colX: number[];
  rowY: number[];
  width: number;
  height: number;
  cells: TableCell[];
}

const cache = new WeakMap<TableObject, TableLayout>();

/** Style of a cell: the header row is bold. */
export const cellStyle = (o: TableObject, row: number): TextStyle => (o.headerRow && row === 0 ? { ...o.style, bold: true } : o.style);

export function layoutTable(o: TableObject): TableLayout {
  const hit = cache.get(o);
  if (hit) return hit;
  const rows = o.cells.length;
  const cols = o.colW.length;
  const colX = [0];
  for (let c = 0; c < cols; c++) colX.push(colX[c] + o.colW[c] * o.width);
  const lineHeight = o.style.fontSize * LINE_HEIGHT_EM;
  const wrapped: string[][][] = [];
  const rowY = [0];
  for (let r = 0; r < rows; r++) {
    const style = cellStyle(o, r);
    wrapped.push([]);
    let lines = 1;
    for (let c = 0; c < cols; c++) {
      const inner = Math.max(4, colX[c + 1] - colX[c] - CELL_PAD * 2);
      const text = o.cells[r]?.[c] ?? '';
      const w = text ? wrapText(text, inner, (t) => measureText(t, style)) : [];
      wrapped[r].push(w);
      lines = Math.max(lines, w.length);
    }
    rowY.push(rowY[r] + Math.max((o.rowH[r] ?? 1 / rows) * o.height, lines * lineHeight + CELL_PAD * 2));
  }
  const cells: TableCell[] = [];
  for (let r = 0; r < rows; r++) {
    const style = cellStyle(o, r);
    for (let c = 0; c < cols; c++) {
      const x = colX[c];
      const width = colX[c + 1] - x;
      const inner = width - CELL_PAD * 2;
      const runs: TextRun[] = wrapped[r][c].map((text, i) => {
        const w = measureText(text, style);
        const dx = style.align === 'center' ? (inner - w) / 2 : style.align === 'right' ? inner - w : 0;
        return { text, x: x + CELL_PAD + dx, baseline: rowY[r] + CELL_PAD + style.fontSize * BASELINE_EM + i * lineHeight, width: w, fontSize: style.fontSize };
      });
      cells.push({ row: r, col: c, x, y: rowY[r], width, height: rowY[r + 1] - rowY[r], style, runs });
    }
  }
  const layout = { colX, rowY, width: o.width, height: rowY[rows], cells };
  cache.set(o, layout);
  return layout;
}

/** The cell under a point given relative to the table's top-left corner. */
export function cellAt(layout: TableLayout, x: number, y: number): { row: number; col: number } | null {
  if (x < 0 || y < 0 || x > layout.width || y > layout.height) return null;
  const col = Math.min(layout.colX.length - 2, Math.max(0, layout.colX.findIndex((v) => v > x) - 1));
  const row = Math.min(layout.rowY.length - 2, Math.max(0, layout.rowY.findIndex((v) => v > y) - 1));
  return { row: layout.rowY[layout.rowY.length - 1] <= y ? layout.rowY.length - 2 : row, col: layout.colX[layout.colX.length - 1] <= x ? layout.colX.length - 2 : col };
}

const even = (n: number) => Array.from({ length: n }, () => 1 / n);

/** Returns the table with another number of rows and columns; existing cell text is kept. */
export function resizeTable(o: TableObject, rows: number, cols: number): TableObject {
  rows = Math.max(1, Math.min(60, Math.round(rows)));
  cols = Math.max(1, Math.min(12, Math.round(cols)));
  const oldRows = o.cells.length;
  const cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => o.cells[r]?.[c] ?? ''));
  // New columns take an equal share; rows keep their height, so the table grows or shrinks.
  const colW = cols === o.colW.length ? o.colW : even(cols);
  const rowHeight = o.height / oldRows;
  return { ...o, cells, colW, rowH: even(rows), height: rowHeight * rows };
}

/** Sets one column to `share` (0..1) of the table width; the other columns keep their proportions. */
export function setColumnShare(o: TableObject, col: number, share: number): TableObject {
  const n = o.colW.length;
  if (n < 2) return o;
  share = Math.max(0.03, Math.min(1 - 0.03 * (n - 1), share));
  const rest = 1 - o.colW[col];
  const colW = o.colW.map((w, i) => (i === col ? share : rest > 0 ? (w * (1 - share)) / rest : (1 - share) / (n - 1)));
  return { ...o, colW };
}

export function newTable(base: Pick<TableObject, 'id' | 'pageIndex' | 'x' | 'y' | 'width'>, rows: number, cols: number, style: TextStyle): TableObject {
  return {
    ...base, type: 'table', rotation: 0, height: rows * (style.fontSize * LINE_HEIGHT_EM + CELL_PAD * 2 + 4),
    cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => '')),
    colW: even(cols), rowH: even(rows), style, headerRow: true, headerFill: '#e2e8f0', fill: '#ffffff', borderColor: '#334155', borderWidth: 0.75,
  };
}
