import { isPageEdit } from '../types/objects';
import type { EditorObject } from '../types/objects';
import type { Rect } from '../types/pdf';
import { layoutTable } from '../engines/TableLayout';
import { layoutTextObject } from '../engines/TextEditLayout';
import { newId } from '../utils/imageUtils';
import { getState } from './documentStore';

/**
 * Work on the current selection (one object or several): copy, cut, paste, delete,
 * duplicate, nudge and align. Each action is one undo step.
 */

export function selectedObjects(): EditorObject[] {
  const s = getState();
  const ids = new Set([s.selectedId, ...s.extraSelected]);
  return s.objects.filter((o) => ids.has(o.id) && !isPageEdit(o));
}

/** Upright box around an object in view space (rotation is not taken into account). */
export function objectBounds(o: EditorObject): Rect {
  if ('points' in o) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (let i = 0; i + 1 < o.points.length; i += 2) {
      x1 = Math.min(x1, o.points[i]);
      x2 = Math.max(x2, o.points[i]);
      y1 = Math.min(y1, o.points[i + 1]);
      y2 = Math.max(y2, o.points[i + 1]);
    }
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
  if (o.type === 'highlight') {
    const x = Math.min(...o.rects.map((r) => r.x));
    const y = Math.min(...o.rects.map((r) => r.y));
    return { x, y, width: Math.max(...o.rects.map((r) => r.x + r.width)) - x, height: Math.max(...o.rects.map((r) => r.y + r.height)) - y };
  }
  if (o.type === 'textedit') return { x: 0, y: 0, width: 0, height: 0 };
  const height = o.type === 'text' ? layoutTextObject(o).height : o.type === 'table' ? layoutTable(o).height : o.height;
  return { x: o.x, y: o.y, width: o.width, height };
}

export function shiftObject<T extends EditorObject>(o: T, dx: number, dy: number): T {
  if ('points' in o) return { ...o, points: o.points.map((v, i) => v + (i % 2 ? dy : dx)) };
  if ('x' in o) return { ...o, x: o.x + dx, y: o.y + dy };
  return o;
}

/** Objects that can be moved freely (marks on text stay with their text). */
const movable = (o: EditorObject) => !isPageEdit(o) && o.type !== 'highlight';

function replaceObjects(changed: Map<string, EditorObject>, key: string | null = null) {
  const s = getState();
  s.commit(s.objects.map((o) => changed.get(o.id) ?? o), key);
}

export function deleteSelection() {
  const s = getState();
  const ids = new Set(selectedObjects().map((o) => o.id));
  if (!ids.size) return;
  s.commit(s.objects.filter((o) => !ids.has(o.id)));
  getState().select(null);
}

export function nudgeSelection(dx: number, dy: number) {
  const changed = new Map(selectedObjects().filter(movable).map((o) => [o.id, shiftObject(o, dx, dy)]));
  if (changed.size) replaceObjects(changed, `nudge:${[...changed.keys()].join()}`);
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Aligns the selected objects with each other; a single object is aligned to its page. */
export function alignSelection(mode: AlignMode) {
  const s = getState();
  const list = selectedObjects().filter(movable);
  if (!list.length) return;
  const boxes = list.map(objectBounds);
  const page = s.pages[list[0].pageIndex];
  const frame: Rect =
    list.length === 1
      ? { x: 0, y: 0, width: page.width, height: page.height }
      : (() => {
          const x = Math.min(...boxes.map((b) => b.x));
          const y = Math.min(...boxes.map((b) => b.y));
          return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
        })();
  const changed = new Map<string, EditorObject>();
  list.forEach((o, i) => {
    const b = boxes[i];
    let dx = 0;
    let dy = 0;
    if (mode === 'left') dx = frame.x - b.x;
    else if (mode === 'center') dx = frame.x + frame.width / 2 - (b.x + b.width / 2);
    else if (mode === 'right') dx = frame.x + frame.width - (b.x + b.width);
    else if (mode === 'top') dy = frame.y - b.y;
    else if (mode === 'middle') dy = frame.y + frame.height / 2 - (b.y + b.height / 2);
    else dy = frame.y + frame.height - (b.y + b.height);
    if (dx || dy) changed.set(o.id, shiftObject(o, dx, dy));
  });
  if (changed.size) replaceObjects(changed);
}

export function selectAllOnPage() {
  const s = getState();
  s.setTool('select');
  getState().selectMany(s.objects.filter((o) => o.pageIndex === s.currentPage && !isPageEdit(o)).map((o) => o.id));
}

// ---- clipboard (kept inside the editor; nothing is put on the system clipboard) -----------------

let clipboard: { objects: EditorObject[]; pageId: string; pastes: number } | null = null;
export const hasClipboard = () => !!clipboard?.objects.length;

export function copySelection(): boolean {
  const list = selectedObjects().filter(movable);
  if (!list.length) return false;
  clipboard = { objects: list, pageId: getState().pages[list[0].pageIndex]?.id ?? '', pastes: 0 };
  getState().toast(`Copied ${list.length} object${list.length > 1 ? 's' : ''}. Press Ctrl+V to paste.`, 'info');
  return true;
}

export function cutSelection() {
  if (copySelection()) deleteSelection();
}

function freshCopy(o: EditorObject, pageIndex: number, dx: number, dy: number, names: Set<string>): EditorObject {
  let copy = shiftObject({ ...o, id: newId(), pageIndex, groupId: undefined }, dx, dy) as EditorObject;
  if (copy.type === 'link') copy = { ...copy, sourceRef: undefined, removed: false };
  if (copy.type === 'field') {
    // Field names must stay unique in the document.
    const base = copy.name.replace(/_\d+$/, '');
    let n = 2;
    while (names.has(`${base}_${n}`)) n++;
    names.add(`${base}_${n}`);
    copy = { ...copy, name: `${base}_${n}` };
  }
  return copy;
}

/** Pastes onto the current page: at the same place on another page, slightly offset on the same one. */
export function pasteClipboard() {
  const s = getState();
  const page = s.pages[s.currentPage];
  if (!clipboard || !page) return;
  const samePage = page.id === clipboard.pageId;
  const step = samePage ? 12 * ++clipboard.pastes : 0;
  const names = new Set(s.objects.map((o) => (o.type === 'field' ? o.name : '')));
  const copies = clipboard.objects.map((o) => freshCopy(o, s.currentPage, step, step, names));
  s.setTool('select');
  getState().commit([...getState().objects, ...copies]);
  getState().selectMany(copies.map((o) => o.id));
}

export function duplicateSelection() {
  const s = getState();
  const list = selectedObjects().filter(movable);
  if (!list.length) return;
  const names = new Set(s.objects.map((o) => (o.type === 'field' ? o.name : '')));
  const copies = list.map((o) => freshCopy(o, o.pageIndex, 12, 12, names));
  s.commit([...s.objects, ...copies]);
  getState().selectMany(copies.map((o) => o.id));
}

/** Removes every object of a group (a header, footer or watermark on all its pages). */
export function removeGroup(groupId: string) {
  const s = getState();
  s.commit(s.objects.filter((o) => o.groupId !== groupId));
  getState().select(null);
}
