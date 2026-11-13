import type { EditorObject, ImageAsset } from '../types/objects';
import type { PageInfo } from '../types/pdf';

export const MAX_PDF_BYTES = 300 * 1024 * 1024;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** A PDF starts with "%PDF-" within the first kilobyte. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = String.fromCharCode(...bytes.subarray(0, Math.min(1024, bytes.length)));
  return head.includes('%PDF-');
}

export function validatePdfFile(name: string, bytes: Uint8Array): string | null {
  if (!bytes.length) return `"${name}" is empty.`;
  if (bytes.length > MAX_PDF_BYTES) return `"${name}" is larger than 300 MB and cannot be edited in the browser.`;
  if (!looksLikePdf(bytes)) return `"${name}" is not a PDF file.`;
  return null;
}

const finite = (...v: number[]) => v.every((n) => Number.isFinite(n));

/** Checks that every object can be exported. Returns human-readable problems (empty = OK). */
export function validateObjects(objects: EditorObject[], pages: PageInfo[], assets: Record<string, ImageAsset>): string[] {
  const problems: string[] = [];
  const fieldNames = new Set<string>();
  for (const o of objects) {
    const where = `page ${o.pageIndex + 1}`;
    if (!pages[o.pageIndex]) {
      problems.push(`A ${o.type} object refers to page ${o.pageIndex + 1}, which does not exist.`);
      continue;
    }
    switch (o.type) {
      case 'image':
        if (!assets[o.assetId]) problems.push(`An image on ${where} lost its image data.`);
        if (!finite(o.x, o.y, o.width, o.height, o.rotation)) problems.push(`An image on ${where} has an invalid position.`);
        break;
      case 'text':
        if (!finite(o.x, o.y, o.width, o.fontSize) || o.fontSize <= 0) problems.push(`A text box on ${where} has an invalid size.`);
        break;
      case 'path':
        if (o.points.length < 2 || !finite(...o.points)) problems.push(`A drawing on ${where} has invalid points.`);
        break;
      case 'line':
      case 'arrow':
        if (!finite(...o.points)) problems.push(`A line on ${where} has invalid points.`);
        break;
      case 'highlight':
        if (!o.rects.length || !o.rects.every((r) => finite(r.x, r.y, r.width, r.height, r.base))) problems.push(`A text mark on ${where} has an invalid position.`);
        break;
      case 'link':
        // Only addresses a reader can safely open; a script must never be stored as a link.
        if (/^\s*(javascript|data|vbscript):/i.test(o.url)) problems.push(`A link on ${where} uses an address type that is not allowed.`);
        if (!finite(o.x, o.y, o.width, o.height)) problems.push(`A link on ${where} has an invalid size.`);
        break;
      case 'field':
        if (!o.name.trim()) problems.push(`A form field on ${where} has no name.`);
        else if (fieldNames.has(o.name)) problems.push(`Two form fields are both named "${o.name}". Give each field its own name.`);
        fieldNames.add(o.name);
        if (!finite(o.x, o.y, o.width, o.height)) problems.push(`A form field on ${where} has an invalid size.`);
        break;
      case 'textedit':
        if (!o.orig.length) problems.push(`A text edit on ${where} lost its original layout.`);
        break;
      default:
        if (!finite(o.x, o.y, o.width, o.height)) problems.push(`A ${o.type} on ${where} has an invalid size.`);
    }
  }
  return problems;
}
