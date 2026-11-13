import type { TextObject } from '../types/objects';
import { BASELINE_EM, LINE_HEIGHT_EM, measureText } from '../utils/fontUtils';
import { newId } from '../utils/imageUtils';
import { getState } from './documentStore';

/**
 * Things that repeat on many pages: headers, footers, page numbers, watermarks and stamps.
 * Each one becomes an ordinary text box on every chosen page (sharing a group id), so it
 * can still be moved, restyled or deleted, alone or as a group. Placeholders such as
 * {page} are filled in per page and follow the page order when pages are moved.
 */

export type Corner = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

const base = { rotation: 0, bold: false, italic: false, underline: false, fontFamily: 'Helvetica', opacity: 1 } as const;

function pageRange(from: number, to: number): number[] {
  const n = getState().pages.length;
  const a = Math.max(1, Math.min(from || 1, n));
  const b = Math.max(a, Math.min(to || n, n));
  return Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i);
}

function commitAll(objects: TextObject[], what: string) {
  const s = getState();
  if (!objects.length) return;
  s.setTool('select');
  getState().commit([...getState().objects, ...objects]);
  getState().toast(`${what} added to ${objects.length} page${objects.length > 1 ? 's' : ''}.`, 'success');
}

export function addHeaderFooter(opts: { text: string; position: Corner; fontSize: number; margin: number; color: string; from: number; to: number }) {
  const s = getState();
  if (!opts.text.trim()) return;
  const groupId = `hf-${newId()}`;
  const [vertical, horizontal] = opts.position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
  const lines = opts.text.split('\n').length;
  const objects = pageRange(opts.from, opts.to).map((pageIndex): TextObject => {
    const page = s.pages[pageIndex];
    const height = lines * opts.fontSize * LINE_HEIGHT_EM;
    return {
      ...base, id: newId(), type: 'text', pageIndex, groupId, fields: true, text: opts.text, fontSize: opts.fontSize, color: opts.color,
      align: horizontal, x: opts.margin, width: Math.max(40, page.width - opts.margin * 2),
      y: vertical === 'top' ? opts.margin : page.height - opts.margin - height,
    };
  });
  commitAll(objects, vertical === 'top' ? 'Header' : 'Footer');
}

/** Top-left corner of a box of size w x h rotated by `deg` (clockwise) so that its centre is at cx, cy. */
function cornerFor(cx: number, cy: number, w: number, h: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  return { x: cx - ((w / 2) * Math.cos(r) - (h / 2) * Math.sin(r)), y: cy - ((w / 2) * Math.sin(r) + (h / 2) * Math.cos(r)) };
}

export function addWatermark(opts: { text: string; fontSize: number; color: string; opacity: number; angle: number; from: number; to: number }) {
  const s = getState();
  if (!opts.text.trim()) return;
  const groupId = `wm-${newId()}`;
  const style = { ...base, bold: true, fontSize: opts.fontSize };
  const width = measureText(opts.text, style) + 4;
  const height = opts.fontSize * LINE_HEIGHT_EM;
  const objects = pageRange(opts.from, opts.to).map((pageIndex): TextObject => {
    const page = s.pages[pageIndex];
    return {
      ...style, id: newId(), type: 'text', pageIndex, groupId, text: opts.text, color: opts.color, opacity: opts.opacity, align: 'center',
      width, rotation: opts.angle, ...cornerFor(page.width / 2, page.height / 2, width, height, opts.angle),
    };
  });
  commitAll(objects, 'Watermark');
}

export const STAMPS = ['APPROVED', 'DRAFT', 'CONFIDENTIAL', 'PAID', 'REJECTED', 'COPY', 'FINAL', 'VOID'];

/** A framed label such as APPROVED, placed near the top right of the page(s). */
export function addStamp(opts: { text: string; color: string; allPages: boolean }) {
  const s = getState();
  const text = opts.text.trim();
  if (!text) return;
  const fontSize = 22;
  const style = { ...base, bold: true, fontSize };
  const width = measureText(text, style) + 2;
  const groupId = opts.allPages ? `st-${newId()}` : undefined;
  const pages = opts.allPages ? s.pages.map((p) => p.index) : [s.currentPage];
  const objects = pages.map((pageIndex): TextObject => {
    const page = s.pages[pageIndex];
    return {
      ...style, id: newId(), type: 'text', pageIndex, groupId, text, color: opts.color, opacity: 0.85, align: 'center', width, rotation: -12,
      frame: { color: opts.color, width: 2, padding: 6 },
      ...cornerFor(page.width - width / 2 - 60, 80, width, fontSize * LINE_HEIGHT_EM, -12),
    };
  });
  if (objects.length === 1) {
    s.setTool('select');
    getState().addObject(objects[0]);
    getState().goToPage(objects[0].pageIndex);
  } else commitAll(objects, 'Stamp');
}

/** Used by tests and the exporter's field context: baseline of the first line of a text box. */
export const firstBaseline = (fontSize: number) => fontSize * BASELINE_EM;
