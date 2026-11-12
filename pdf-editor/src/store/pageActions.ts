import { PDFDocument } from 'pdf-lib';
import type { EditorObject } from '../types/objects';
import type { Matrix, PageInfo } from '../types/pdf';
import { applyMatrix, invert, makePageInfo, mul } from '../engines/CoordinateMapper';
import { openSource, readPages } from '../engines/PdfRenderer';
import { newId } from '../utils/imageUtils';
import { validatePdfFile } from '../utils/validationUtils';
import { getState } from './documentStore';

/**
 * Page tools: delete, rotate, move, insert a blank page, add the pages of another PDF.
 * The original file is not touched while editing; the page list is the plan that the
 * exporter carries out. Every action is one undo step and keeps edits on their pages.
 */

const renumber = (pages: PageInfo[]): PageInfo[] => pages.map((p, i) => (p.index === i ? p : { ...p, index: i }));

/** Moves edits to the new position of their page; edits of removed pages are dropped. */
function remap(objects: EditorObject[], before: PageInfo[], after: PageInfo[]): EditorObject[] {
  const where = new Map(after.map((p, i) => [p.id, i]));
  const out: EditorObject[] = [];
  for (const o of objects) {
    const to = where.get(before[o.pageIndex]?.id);
    if (to === undefined) continue;
    out.push(to === o.pageIndex ? o : { ...o, pageIndex: to });
  }
  return out;
}

function apply(pages: PageInfo[], objects: EditorObject[], focus: number) {
  const s = getState();
  const next = renumber(pages);
  s.commitDoc(remap(objects, s.pages, next), next);
  getState().goToPage(Math.max(0, Math.min(focus, next.length - 1)));
}

export function deletePage(index: number) {
  const s = getState();
  if (s.pages.length <= 1) return s.toast('A document needs at least one page.', 'warning');
  apply(s.pages.filter((_, i) => i !== index), s.objects, Math.min(index, s.pages.length - 2));
}

export function movePage(from: number, to: number) {
  const s = getState();
  if (from === to || !s.pages[from] || to < 0 || to >= s.pages.length) return;
  const pages = [...s.pages];
  const [page] = pages.splice(from, 1);
  pages.splice(to, 0, page);
  apply(pages, s.objects, to);
}

/** Moves an edit from one orientation of its page to another. */
function rotateObject(o: EditorObject, m: Matrix, delta: number): EditorObject {
  if ('points' in o) {
    const points: number[] = [];
    for (let i = 0; i + 1 < o.points.length; i += 2) points.push(...applyMatrix(m, o.points[i], o.points[i + 1]));
    return { ...o, points } as EditorObject;
  }
  if (o.type === 'textedit') return o;
  if (!('rotation' in o)) {
    // Whiteout / redaction boxes stay upright rectangles.
    const [ax, ay] = applyMatrix(m, o.x, o.y);
    const [bx, by] = applyMatrix(m, o.x + o.width, o.y + o.height);
    return { ...o, x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
  }
  const [x, y] = applyMatrix(m, o.x, o.y);
  return { ...o, x, y, rotation: (((o.rotation + delta) % 360) + 360) % 360 };
}

/** Rotates a page by a multiple of 90 degrees (clockwise for positive values). */
export function rotatePage(index: number, delta: number) {
  const s = getState();
  const old = s.pages[index];
  if (!old) return;
  const edits = s.objects.filter((o) => o.pageIndex === index && o.type === 'textedit').length;
  if (
    edits &&
    !window.confirm(
      `This page has ${edits} change${edits > 1 ? 's' : ''} to its original text. They cannot be kept when the page is rotated and will be removed (Undo brings them back). Rotate anyway?`,
    )
  ) {
    return;
  }
  const next = makePageInfo(old, index, old.userRotation + delta);
  // Same point on the paper, old screen position -> new screen position.
  const m = mul(next.viewTransform, invert(old.viewTransform));
  const objects = s.objects
    .filter((o) => !(o.pageIndex === index && o.type === 'textedit'))
    .map((o) => (o.pageIndex === index ? rotateObject(o, m, next.rotation - old.rotation) : o));
  apply(s.pages.map((p, i) => (i === index ? next : p)), objects, index);
}

/** Inserts an empty page after `after`, with the size of that page. */
export function insertBlankPage(after: number) {
  const s = getState();
  const ref = s.pages[after] ?? s.pages[s.pages.length - 1];
  const page = makePageInfo(
    { id: `blank:${newId()}`, source: 'blank', srcIndex: 0, viewBox: [0, 0, ref?.width ?? 612, ref?.height ?? 792], userUnit: 1, baseRotation: 0 },
    after + 1,
  );
  const pages = [...s.pages];
  pages.splice(after + 1, 0, page);
  apply(pages, s.objects, after + 1);
}

/** Adds all pages of another PDF after `after`. The file stays on this device. */
export async function insertPdfFile(file: File, after: number) {
  const s = getState();
  s.setLoading(`Adding ${file.name}…`);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const problem = validatePdfFile(file.name, bytes);
    if (problem) throw new Error(problem);
    // It must be readable for display and rewritable for export.
    await PDFDocument.load(bytes, { updateMetadata: false }).catch((e) => {
      throw new Error(
        /encrypt/i.test(e?.message ?? '')
          ? `"${file.name}" is encrypted, so its pages cannot be added. Use an unprotected copy.`
          : `"${file.name}" has a structure that cannot be combined with this document.`,
      );
    });
    const id = `add-${newId()}`;
    const added = await readPages(await openSource(id, bytes), id);
    const now = getState();
    now.addSource(id, file.name, bytes);
    const pages = [...now.pages];
    pages.splice(after + 1, 0, ...added);
    now.setLoading(null);
    apply(pages, now.objects, after + 1);
    getState().toast(`Added ${added.length} page${added.length > 1 ? 's' : ''} from ${file.name}.`, 'success');
  } catch (e: any) {
    getState().setLoading(null);
    getState().toast(e?.message ?? 'The PDF could not be added.', 'error');
  }
}
