/** Affine matrix [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Matrix = [number, number, number, number, number, number];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One PDF page as shown on screen.
 * "View space" is the PDF.js viewport at scale 1: points, origin at the top-left
 * of the visible (cropped, rotated) page, y pointing down.
 */
export interface PageInfo {
  /** Current position in the document (changes when pages are moved, added or deleted). */
  index: number;
  /** Stable identity of the page, independent of its position. */
  id: string;
  /** Where the page comes from: "main", the id of an added PDF, or "blank". */
  source: string;
  /** Page index inside its source document. */
  srcIndex: number;
  /** Visible box of the page in PDF user space [x1, y1, x2, y2] (CropBox within MediaBox). */
  viewBox: [number, number, number, number];
  userUnit: number;
  /** /Rotate stored in the source file. */
  baseRotation: number;
  /** Extra rotation chosen in the editor (0, 90, 180, 270). */
  userRotation: number;
  /** Width in view space (points), after rotation and cropping. */
  width: number;
  /** Height in view space (points), after rotation and cropping. */
  height: number;
  /** Total rotation shown on screen: baseRotation + userRotation. */
  rotation: number;
  /** PDF user space -> view space (PDF.js viewport transform at scale 1). */
  viewTransform: Matrix;
}

export interface DocumentInfo {
  fileName: string;
  fileSize: number;
  numPages: number;
  title?: string;
  author?: string;
  producer?: string;
  pdfVersion?: string;
  /** False when pdf-lib cannot rewrite the file (for example, it is encrypted). */
  exportable: boolean;
  exportBlocker?: string;
}
