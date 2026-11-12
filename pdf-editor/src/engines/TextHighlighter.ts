import type { HighlightObject, MarkMode, MarkRect } from '../types/objects';
import type { Matrix, Rect } from '../types/pdf';
import type { TextLine } from '../types/text';
import { applyMatrix } from './CoordinateMapper';
import { ensureCharX } from './PdfTextExtractor';

/**
 * Text marks: highlight, underline, strikethrough. A mark stores the band of every text
 * line it covers (view space); the shape that is drawn is derived from the band, so the
 * screen and the exported file always agree.
 */

export const MARK_OPACITY: Record<MarkMode, number> = { highlight: 0.4, underline: 1, strike: 1 };

/** The part of each text line that a dragged box covers, snapped to whole characters. */
export function marksForBox(lines: TextLine[], box: Rect): MarkRect[] {
  const out: MarkRect[] = [];
  const boxRight = box.x + box.width;
  const boxBottom = box.y + box.height;
  for (const line of lines) {
    const height = line.bottom - line.top;
    if (height <= 0 || line.right <= box.x || line.x >= boxRight) continue;
    const overlap = Math.min(line.bottom, boxBottom) - Math.max(line.top, box.y);
    // A thin drag along one line counts; a box merely touching a neighbouring line does not.
    if (overlap < Math.min(height * 0.4, box.height * 0.6) || overlap <= 0) continue;
    let left = line.x;
    let right = line.right;
    if (line.reliableChars || line.charX) {
      const xs = ensureCharX(line);
      // A character is covered when the box reaches past its middle.
      let a = -1;
      let b = -1;
      for (let k = 0; k + 1 < xs.length; k++) {
        const mid = (xs[k] + xs[k + 1]) / 2;
        if (mid < box.x || mid > boxRight || !line.text[k]?.trim()) continue;
        if (a < 0) a = k;
        b = k + 1;
      }
      if (a < 0) continue;
      left = xs[a];
      right = xs[b];
    } else {
      const hit = line.segments.filter((s) => s.x < boxRight && s.x + s.width > box.x);
      if (!hit.length) continue;
      left = Math.min(...hit.map((s) => s.x));
      right = Math.max(...hit.map((s) => s.x + s.width));
    }
    if (right - left < 0.5) continue;
    out.push({ x: left, y: line.top, width: right - left, height, base: line.baseline - line.top });
  }
  return out;
}

/** A mark for an area without text (for example a scanned page). */
export const markForArea = (box: Rect): MarkRect => ({ ...box, base: box.height * 0.8 });

/** The rectangles that are actually painted for a mark. */
export function markShapes(o: Pick<HighlightObject, 'mode' | 'rects'>): Rect[] {
  if (o.mode === 'highlight') return o.rects.map(({ x, y, width, height }) => ({ x, y, width, height }));
  return o.rects.map((r) => {
    const t = Math.max(0.6, r.height * 0.06);
    const y = o.mode === 'underline' ? r.y + r.base + r.height * 0.1 : r.y + r.base - r.height * 0.26;
    return { x: r.x, y: y - t / 2, width: r.width, height: t };
  });
}

/**
 * Carries a mark to another orientation of its page. Underlines and strikethroughs are
 * turned into their painted shapes first, because their line no longer runs left to right.
 */
export function rotateMark(o: HighlightObject, m: Matrix): HighlightObject {
  const rects = markShapes(o).map((r) => {
    const [ax, ay] = applyMatrix(m, r.x, r.y);
    const [bx, by] = applyMatrix(m, r.x + r.width, r.y + r.height);
    const height = Math.abs(by - ay);
    return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height, base: height * 0.8 };
  });
  return { ...o, mode: 'highlight', rects };
}
