import type { EditorObject, ImageCutObject, ImageObject } from '../types/objects';
import type { PageInfo } from '../types/pdf';
import type { PageImage } from '../engines/PdfImages';
import { extractPageImage } from '../engines/PdfRenderer';
import { samplePageColors } from '../utils/canvasUtils';
import { importImageFile, newId } from '../utils/imageUtils';
import { getState } from './documentStore';

/**
 * Image tools: edit a picture that is already in the PDF, replace the picture of an image
 * object, and move an object to another page.
 */

/** Corners of a box that is rotated clockwise about its top-left corner. */
function bounds(o: { x: number; y: number; width: number; height: number; rotation: number }) {
  const r = (o.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const xs = [0, o.width * c, -o.height * s, o.width * c - o.height * s].map((v) => v + o.x);
  const ys = [0, o.width * s, o.height * c, o.width * s + o.height * c].map((v) => v + o.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

const lifting = new Set<string>();

/**
 * Turns a picture of the original page into an image object at the same place, so it can
 * be moved, resized, replaced or deleted. One undo step brings the original back.
 */
export async function liftPageImage(page: PageInfo, img: PageImage, dx = 0, dy = 0) {
  const key = `${page.id}:${img.key}`;
  if (lifting.has(key)) return;
  lifting.add(key);
  try {
    const asset = await extractPageImage(page, img.objId, `page-${page.index + 1}-picture-${img.key}`);
    const s = getState();
    const index = s.pages.findIndex((p) => p.id === page.id);
    if (index < 0) return;
    if (s.objects.some((o) => o.type === 'imagecut' && o.pageIndex === index && o.key === img.key)) return;
    const box = { x: img.x, y: img.y, width: img.width, height: img.height, rotation: img.rotation };
    const cut: ImageCutObject = {
      id: newId(), type: 'imagecut', pageIndex: index, ...box,
      fill: samplePageColors(page.id, bounds(box), page.width).background, key: img.key, seq: img.seq, total: img.total,
    };
    const image: ImageObject = { id: newId(), type: 'image', pageIndex: index, ...box, x: box.x + dx, y: box.y + dy, opacity: 1, assetId: asset.id, keepRatio: true };
    s.addAsset(asset);
    s.commit([...s.objects, cut, image]);
    getState().select(image.id);
  } catch (e: any) {
    getState().toast(e?.message ?? 'This picture could not be made editable.', 'error');
  } finally {
    lifting.delete(key);
  }
}

/** Puts another picture into an image object. It keeps its place and width; the height follows the new picture. */
export async function replaceImage(id: string, file: File) {
  try {
    const asset = await importImageFile(file);
    const s = getState();
    const o = s.objects.find((x) => x.id === id);
    if (!o || o.type !== 'image') return;
    s.addAsset(asset);
    s.updateObject(id, { assetId: asset.id, height: o.keepRatio ? (o.width * asset.height) / asset.width : o.height, signature: false });
    s.toast(`Image replaced with ${file.name}.`, 'success');
  } catch (e: any) {
    getState().toast(e?.message ?? 'The image could not be replaced.', 'error');
  }
}

/** Moves an object to another page by `dx`, `dy` (the offset between the two pages on screen). */
export function moveObjectToPage(id: string, pageIndex: number, dx = 0, dy = 0) {
  const s = getState();
  const o = s.objects.find((x) => x.id === id);
  const page = s.pages[pageIndex];
  if (!o || !page || o.type === 'textedit' || o.type === 'imagecut' || o.type === 'highlight') return;
  let patch: Partial<EditorObject>;
  if ('points' in o) {
    patch = { pageIndex, points: o.points.map((v, i) => v + (i % 2 ? dy : dx)) } as Partial<EditorObject>;
  } else {
    // Keep at least a corner of the object on the page so it can be found again.
    const x = Math.min(Math.max(o.x + dx, 8 - o.width), page.width - 8);
    const y = Math.min(Math.max(o.y + dy, -8), page.height - 8);
    patch = { pageIndex, x, y } as Partial<EditorObject>;
  }
  s.updateObject(id, patch);
  getState().select(id);
}
