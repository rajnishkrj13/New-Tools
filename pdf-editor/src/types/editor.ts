import type { TextStyle } from './objects';

export type Tool =
  | 'select'
  | 'edittext'
  | 'addtext'
  | 'whiteout'
  | 'redact'
  | 'draw'
  | 'eraser'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow';

export const SHAPE_TOOLS: Tool[] = ['rect', 'ellipse', 'line', 'arrow'];

export interface ToolStyle {
  drawColor: string;
  drawWidth: number;
  shapeFill: string | null;
  shapeStroke: string;
  shapeStrokeWidth: number;
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
