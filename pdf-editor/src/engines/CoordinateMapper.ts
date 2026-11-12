import type { Matrix, PageInfo, Rect } from '../types/pdf';

/**
 * Central coordinate conversion.
 *
 *   screen px  --(/ zoom)-->  view space  --(inverse viewport transform)-->  PDF user space
 *
 * Every editor object is stored in view space (points, top-left origin, y down, page
 * rotation and CropBox already applied). The viewport transform comes from PDF.js, so
 * rotation, CropBox/MediaBox offsets and UserUnit are handled by one matrix instead of
 * a per-case formula. Zoom, CSS scaling and devicePixelRatio never reach stored data.
 */

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
/** Flips a y-up local frame into y-down view space (and back). */
export const FLIP_Y: Matrix = [1, 0, 0, -1, 0, 0];

/** Returns m1 ∘ m2 (m2 is applied to the point first). */
export function mul(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) throw new Error('Page transform is not invertible');
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];

/** Clockwise rotation in y-down view space (same convention as the canvas layer). */
export function rotateDeg(deg: number): Matrix {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

/**
 * Same maths as the PDF.js PageViewport at scale 1. Used when PDF.js is not available
 * (tests, flattened pages); the app itself stores the transform PDF.js reports.
 */
export function computeViewTransform(
  viewBox: [number, number, number, number],
  rotation: number,
  s = 1,
): { transform: Matrix; width: number; height: number } {
  const [x1, y1, x2, y2] = viewBox;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rot = ((rotation % 360) + 360) % 360;
  let a: number, b: number, c: number, d: number;
  if (rot === 90) [a, b, c, d] = [0, 1, 1, 0];
  else if (rot === 180) [a, b, c, d] = [-1, 0, 0, 1];
  else if (rot === 270) [a, b, c, d] = [0, -1, -1, 0];
  else [a, b, c, d] = [1, 0, 0, -1];
  let ox: number, oy: number, width: number, height: number;
  if (a === 0) {
    ox = Math.abs(cy - y1) * s;
    oy = Math.abs(cx - x1) * s;
    width = (y2 - y1) * s;
    height = (x2 - x1) * s;
  } else {
    ox = Math.abs(cx - x1) * s;
    oy = Math.abs(cy - y1) * s;
    width = (x2 - x1) * s;
    height = (y2 - y1) * s;
  }
  return {
    transform: [a * s, b * s, c * s, d * s, ox - a * s * cx - c * s * cy, oy - b * s * cx - d * s * cy],
    width,
    height,
  };
}

export type PageSource = Pick<PageInfo, 'id' | 'source' | 'srcIndex' | 'viewBox' | 'userUnit' | 'baseRotation'>;

/** Builds the on-screen geometry of a page at a position, with an extra editor rotation. */
export function makePageInfo(base: PageSource, index: number, userRotation = 0): PageInfo {
  const user = ((userRotation % 360) + 360) % 360;
  const rotation = (base.baseRotation + user) % 360;
  const { transform, width, height } = computeViewTransform(base.viewBox, rotation, base.userUnit || 1);
  return {
    index, id: base.id, source: base.source, srcIndex: base.srcIndex, viewBox: base.viewBox, userUnit: base.userUnit || 1,
    baseRotation: base.baseRotation, userRotation: user, rotation, width, height, viewTransform: transform,
  };
}

export const viewToPdfMatrix = (page: PageInfo): Matrix => invert(page.viewTransform);

export function viewToPdf(page: PageInfo, x: number, y: number): [number, number] {
  return applyMatrix(viewToPdfMatrix(page), x, y);
}

export function pdfToView(page: PageInfo, x: number, y: number): [number, number] {
  return applyMatrix(page.viewTransform, x, y);
}

/** Screen pixels relative to the page element -> view space. */
export const domToView = (px: number, zoom: number): number => px / zoom;
export const viewToDom = (pt: number, zoom: number): number => pt * zoom;

/** Axis-aligned view rect -> axis-aligned PDF rect (bottom-left origin), valid for any rotation. */
export function viewRectToPdfRect(page: PageInfo, r: Rect): Rect {
  const m = viewToPdfMatrix(page);
  const [ax, ay] = applyMatrix(m, r.x, r.y);
  const [bx, by] = applyMatrix(m, r.x + r.width, r.y + r.height);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}
