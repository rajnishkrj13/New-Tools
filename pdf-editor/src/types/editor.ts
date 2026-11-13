import type { MarkMode, TextStyle } from './objects';

export type Tool =
  | 'select'
  | 'edittext'
  | 'addtext'
  | 'highlight'
  | 'whiteout'
  | 'redact'
  | 'draw'
  | 'eraser'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'link'
  | 'note'
  | 'textfield'
  | 'checkbox';

/** One place where the searched text was found. */
export interface SearchHit {
  pageIndex: number;
  /** Area of the match in view space. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Where the match is, so it can be replaced. */
  target:
    | { kind: 'page'; paragraphId: string; slot: number; start: number; end: number }
    | { kind: 'object'; id: string; start: number; end: number };
}

export const SHAPE_TOOLS: Tool[] = ['rect', 'ellipse', 'line', 'arrow'];

export interface ToolStyle {
  drawColor: string;
  drawWidth: number;
  shapeFill: string | null;
  shapeStroke: string;
  shapeStrokeWidth: number;
  markMode: MarkMode;
  markColor: string;
  text: TextStyle;
}

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success' | 'warning';
  message: string;
}

export interface ExportState {
  status: 'idle' | 'running' | 'done' | 'error';
  progress: number;
  label: string;
  error?: string;
  details?: string[];
  warnings?: string[];
  pagesModified?: number;
  objectsWritten?: number;
  flattenedPages?: number[];
  removedGlyphs?: number;
  structureChanged?: boolean;
  /** Show the result dialog (Apply Changes) or stay silent (direct download). */
  dialog: boolean;
}
