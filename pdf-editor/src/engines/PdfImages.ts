import type { Matrix } from '../types/pdf';
import { IDENTITY, applyMatrix, mul } from './CoordinateMapper';
import { scanShowOps, type DoOp } from './TextRemover';

/**
 * Pictures that are already in the PDF.
 *
 * PDF.js' operator list tells where each picture of a page is painted; the n-th picture
 * it paints is the n-th image "Do" operator of the page's content stream. To move, resize,
 * replace or delete such a picture, the editor copies it into an ordinary image object and
 * takes its "Do" operator out of the content stream on export.
 */

export interface PageImage {
  /** Identity of the picture on its page. */
  key: string;
  /**
   * Position among the image paint operators of the page's own content stream, or -1 for a
   * picture inside a form XObject (it can be edited, but is covered instead of removed).
   */
  seq: number;
  /** Number of those operators, or -1 when PDF.js merged some and they cannot be counted. */
  total: number;
  /** PDF.js object id of the decoded picture. */
  objId: string;
  /** Placement in view space, in the same form as an image object. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface OperatorList {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<any>;
}

/** Lists the pictures of a page, including those inside form XObjects (not those of annotations). */
export function analyzeImageOps(list: OperatorList, OPS: Record<string, number>, viewTransform: Matrix): PageImage[] {
  const out: PageImage[] = [];
  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  let forms = 0;
  let annotations = 0;
  let seq = 0;
  let inForms = 0;
  let countable = true;
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const a = list.argsArray[i];
    if (fn === OPS.beginAnnotation) {
      annotations++;
      continue;
    }
    if (fn === OPS.endAnnotation) {
      annotations = Math.max(0, annotations - 1);
      continue;
    }
    if (annotations) continue;
    if (fn === OPS.paintFormXObjectBegin) {
      // A form draws in its own coordinate system, which ends with the form.
      forms++;
      stack.push(ctm);
      const m = a?.[0];
      if (m && m.length === 6) ctm = mul(ctm, [m[0], m[1], m[2], m[3], m[4], m[5]]);
      continue;
    }
    if (fn === OPS.paintFormXObjectEnd) {
      forms = Math.max(0, forms - 1);
      if (stack.length) ctm = stack.pop()!;
      continue;
    }
    switch (fn) {
      case OPS.save:
        stack.push(ctm);
        break;
      case OPS.restore:
        if (stack.length) ctm = stack.pop()!;
        break;
      case OPS.transform:
        ctm = mul(ctm, [a[0], a[1], a[2], a[3], a[4], a[5]]);
        break;
      case OPS.paintImageXObject: {
        const m = mul(viewTransform, ctm);
        // A picture fills the unit square; its top-left corner is (0, 1).
        const [tlx, tly] = applyMatrix(m, 0, 1);
        const [trx, try_] = applyMatrix(m, 1, 1);
        const [blx, bly] = applyMatrix(m, 0, 0);
        const ux = trx - tlx;
        const uy = try_ - tly;
        const vx = blx - tlx;
        const vy = bly - tly;
        const width = Math.hypot(ux, uy);
        const height = Math.hypot(vx, vy);
        // Mirrored or skewed pictures cannot be described by position, size and rotation.
        const upright = width > 1 && height > 1 && ux * vy - uy * vx > 0 && Math.abs(ux * vx + uy * vy) < 0.01 * width * height;
        if (upright && typeof a?.[0] === 'string') {
          const place = { objId: a[0] as string, x: tlx, y: tly, width, height, rotation: (Math.atan2(uy, ux) * 180) / Math.PI };
          out.push(forms ? { key: `f${inForms}`, seq: -1, total: -1, ...place } : { key: `t${seq}`, seq, total: 0, ...place });
        }
        if (forms) inForms++;
        else seq++;
        break;
      }
      case OPS.paintImageMaskXObject:
      case OPS.paintSolidColorImageMask:
        if (!forms) seq++;
        break;
      case OPS.paintImageXObjectRepeat:
      case OPS.paintImageMaskXObjectGroup:
      case OPS.paintImageMaskXObjectRepeat:
        // Several operators were merged into one: their number is unknown.
        if (!forms) countable = false;
        break;
    }
  }
  for (const img of out) if (img.seq >= 0) img.total = countable ? seq : -1;
  return out;
}

/**
 * Blanks the `seq`-th image "Do" operator of a content stream for every requested cut.
 * Returns null (and changes nothing) when the stream does not have exactly the pictures
 * PDF.js painted, so a wrong picture is never removed.
 */
export function removeImageOps(
  content: Uint8Array,
  isImage: (name: string) => boolean,
  cuts: { seq: number; total: number }[],
): Uint8Array | null {
  if (!cuts.length) return content;
  const dos: DoOp[] = [];
  scanShowOps(content, dos);
  const images = dos.filter((d) => isImage(d.name));
  if (cuts.some((c) => c.total !== images.length || c.seq < 0 || c.seq >= images.length)) return null;
  const bytes = content.slice();
  for (const c of cuts) bytes.fill(32, images[c.seq].start, images[c.seq].end);
  return bytes;
}
