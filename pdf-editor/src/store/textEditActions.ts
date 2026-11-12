import type { TextEditObject, TextStyle } from '../types/objects';
import type { Paragraph } from '../types/text';
import { getCachedTextModel } from '../engines/PdfTextExtractor';
import { applyRangeEdit, createTextEdit, isNoopEdit, layoutTextEdit, paragraphSlots, restyleTextEdit, type Slot } from '../engines/TextEditLayout';
import { samplePageColors } from '../utils/canvasUtils';
import { newId } from '../utils/imageUtils';
import { getState } from './documentStore';

export const findParagraph = (pageIndex: number, paragraphId: string): Paragraph | undefined =>
  getCachedTextModel(pageIndex)?.paragraphs.find((p) => p.id === paragraphId);

export const findTextEdit = (paragraphId: string): TextEditObject | undefined =>
  getState().objects.find((o): o is TextEditObject => o.type === 'textedit' && o.paragraphId === paragraphId);

/** Current lines of a paragraph: the edited layout if it was edited, else the original. */
export function liveSlots(para: Paragraph, edit?: TextEditObject): Slot[] {
  return edit ? layoutTextEdit(edit).slots : paragraphSlots(para);
}

function editFor(para: Paragraph): TextEditObject {
  const existing = findTextEdit(para.id);
  if (existing) return existing;
  const top = Math.min(...para.lines.map((l) => l.top));
  const bottom = Math.max(...para.lines.map((l) => l.bottom));
  const page = getState().pages[para.pageIndex];
  const colors = samplePageColors(
    page.id,
    { x: para.left, y: top, width: para.right - para.left, height: bottom - top },
    page.width,
  );
  return createTextEdit(para, colors, newId());
}

function store(next: TextEditObject, key: string | null = null) {
  const { objects, commit } = getState();
  const exists = objects.some((o) => o.id === next.id);
  if (isNoopEdit(next)) {
    if (exists) commit(objects.filter((o) => o.id !== next.id));
    return;
  }
  commit(exists ? objects.map((o) => (o.id === next.id ? next : o)) : [...objects, next], key);
}

/** Replaces characters [start, end) of one line of a paragraph and reflows the paragraph. */
export function editParagraphText(para: Paragraph, slot: number, start: number, end: number, replacement: string) {
  const edit = editFor(para);
  const current = edit.lines[slot] ?? '';
  if (current.slice(start, end) === replacement) return;
  store(applyRangeEdit(edit, slot, start, end, replacement));
}

export function styleParagraph(para: Paragraph, patch: Partial<TextStyle>, key?: string) {
  store(restyleTextEdit(editFor(para), patch), key ? `${para.id}:${key}` : null);
}

/** Drops every edit of a paragraph, returning it to the original page content. */
export function revertParagraph(paragraphId: string) {
  const edit = findTextEdit(paragraphId);
  if (edit) getState().removeObject(edit.id);
}
