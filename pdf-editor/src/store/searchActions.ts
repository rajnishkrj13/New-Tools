import type { SearchHit } from '../types/editor';
import type { MaskObject, TextEditObject } from '../types/objects';
import type { Rect } from '../types/pdf';
import { getPdfPage } from '../engines/PdfRenderer';
import { loadTextModel } from '../engines/PdfTextExtractor';
import { layoutTextObject } from '../engines/TextEditLayout';
import { layoutTable } from '../engines/TableLayout';
import { findMatches, needsQuery, patternError, type SearchSpec } from '../engines/TextSearch';
import { newId } from '../utils/imageUtils';
import { getState } from './documentStore';
import { editParagraphText, findParagraph, liveSlots } from './textEditActions';

/**
 * Find, replace and redact across the whole document: the text of the PDF (as it currently
 * reads, edits included), the text boxes, tables and comments that were added. A match lies
 * within one line.
 */

const specOf = (): SearchSpec => {
  const { mode, query, matchCase } = getState().search;
  return { mode, query, matchCase };
};

/** Upright box around a rectangle turned by `deg` degrees about its top-left corner. */
function turnedBox(x: number, y: number, w: number, h: number, deg: number): Rect {
  if (!deg) return { x, y, width: w, height: h };
  const r = (deg * Math.PI) / 180;
  const pts = [[0, 0], [w, 0], [0, h], [w, h]].map(([px, py]) => [x + px * Math.cos(r) - py * Math.sin(r), y + px * Math.sin(r) + py * Math.cos(r)]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

async function collectHits(spec: SearchSpec): Promise<SearchHit[]> {
  const s = getState();
  const hits: SearchHit[] = [];
  if (needsQuery(spec.mode) && !spec.query) return hits;
  for (const page of s.pages) {
    const model = await loadTextModel(await getPdfPage(page), page);
    const objects = getState().objects;
    const edits = new Map<string, TextEditObject>();
    for (const o of objects) if (o.type === 'textedit' && o.pageIndex === page.index) edits.set(o.paragraphId, o);
    for (const para of model.paragraphs) {
      for (const slot of liveSlots(para, edits.get(para.id))) {
        for (const { start, end } of findMatches(slot.text, spec)) {
          const cx = slot.charX;
          hits.push({
            pageIndex: page.index, x: cx[start], y: slot.top, width: cx[end] - cx[start], height: slot.bottom - slot.top,
            target: { kind: 'page', paragraphId: para.id, slot: slot.index, start, end },
          });
        }
      }
    }
    for (const o of objects) {
      if (o.pageIndex !== page.index) continue;
      if (o.type === 'text') {
        for (const { start, end } of findMatches(o.text, spec)) {
          hits.push({ pageIndex: page.index, x: o.x, y: o.y, width: o.width, height: layoutTextObject(o).height, target: { kind: 'object', id: o.id, start, end } });
        }
      } else if (o.type === 'table') {
        // Table text is found, but a table is replaced or redacted as a whole.
        if (o.cells.some((row) => row.some((cell) => findMatches(cell, spec).length))) {
          const lay = layoutTable(o);
          hits.push({ pageIndex: page.index, ...turnedBox(o.x, o.y, lay.width, lay.height, o.rotation), target: { kind: 'whole', id: o.id } });
        }
      } else if (o.type === 'note') {
        if ([o.text, ...o.replies.map((r) => r.text)].some((t) => findMatches(t, spec).length)) {
          hits.push({ pageIndex: page.index, x: o.x, y: o.y, width: o.width, height: o.height, target: { kind: 'whole', id: o.id } });
        }
      }
    }
  }
  // Reading order: page, then top to bottom, then left to right.
  return hits.sort((a, b) => a.pageIndex - b.pageIndex || a.y - b.y || a.x - b.x);
}

let run = 0;

/** Searches again with the current search and keeps the position in the result list where possible. */
export async function runSearch(keepIndex = false) {
  const s = getState();
  const spec = specOf();
  const mine = ++run;
  if ((needsQuery(spec.mode) && !spec.query) || patternError(spec)) return s.setSearch({ hits: [], index: -1, busy: false });
  s.setSearch({ busy: true });
  try {
    const hits = await collectHits(spec);
    if (mine !== run) return;
    const prev = getState().search.index;
    const index = hits.length ? (keepIndex ? Math.min(Math.max(prev, 0), hits.length - 1) : 0) : -1;
    getState().setSearch({ hits, index, busy: false });
    if (index >= 0 && !keepIndex) showHit(index);
  } catch {
    if (mine === run) getState().setSearch({ hits: [], index: -1, busy: false });
  }
}

/** Scrolls the viewer so the hit is in view. */
function showHit(index: number) {
  const s = getState();
  const hit = s.search.hits[index];
  if (!hit) return;
  s.setSearch({ index });
  s.goToPage(hit.pageIndex);
  requestAnimationFrame(() => {
    const viewer = document.querySelector<HTMLElement>('[data-viewer]');
    const el = viewer?.querySelector<HTMLElement>(`[data-page="${hit.pageIndex}"]`);
    if (viewer && el) viewer.scrollTop = el.offsetTop + hit.y * getState().zoom - viewer.clientHeight / 3;
  });
}

export function stepSearch(direction: 1 | -1) {
  const { hits, index } = getState().search;
  if (hits.length) showHit((index + direction + hits.length) % hits.length);
}

/** Replaces one match. Returns false when it cannot be replaced (a table or a comment). */
function applyReplace(hit: SearchHit, replacement: string, key: string | null): boolean {
  const s = getState();
  if (hit.target.kind === 'whole') return false;
  if (hit.target.kind === 'object') {
    const { id, start, end } = hit.target;
    const o = s.objects.find((x) => x.id === id);
    if (!o || o.type !== 'text') return false;
    s.commit(s.objects.map((x) => (x === o ? { ...o, text: o.text.slice(0, start) + replacement + o.text.slice(end) } : x)), key);
    return true;
  }
  const para = findParagraph(hit.pageIndex, hit.target.paragraphId);
  if (!para) return false;
  editParagraphText(para, hit.target.slot, hit.target.start, hit.target.end, replacement, key);
  return true;
}

export async function replaceCurrent() {
  const { hits, index, replace } = getState().search;
  const hit = hits[index];
  if (!hit) return;
  if (!applyReplace(hit, replace, null)) getState().toast('This match is inside a table or a comment and cannot be replaced here. Edit it directly, or redact it.', 'info');
  await runSearch(true);
  const now = getState().search;
  if (now.hits.length) showHit(Math.min(index, now.hits.length - 1));
}

export async function replaceAll() {
  const hits = await collectHits(specOf());
  const { replace } = getState().search;
  if (!hits.length) return;
  // Last match first: a replacement only re-flows what comes after it, so earlier matches stay where they are.
  const ordered = [...hits].sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return b.pageIndex - a.pageIndex;
    const sa = a.target.kind === 'page' ? a.target.slot : 0;
    const sb = b.target.kind === 'page' ? b.target.slot : 0;
    const startOf = (h: SearchHit) => (h.target.kind === 'whole' ? 0 : h.target.start);
    return sb - sa || startOf(b) - startOf(a);
  });
  let done = 0;
  for (const hit of ordered) if (applyReplace(hit, replace, 'replace-all')) done++;
  const skipped = hits.length - done;
  getState().toast(`Replaced ${done} occurrence${done === 1 ? '' : 's'}.${skipped ? ` ${skipped} inside tables or comments were left as they are.` : ''}`, done ? 'success' : 'info');
  await runSearch();
}

// ---- redaction ---------------------------------------------------------------------------------

const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

/**
 * Puts a black redaction box over each match (the current one, or all of them). The boxes are
 * normal redaction boxes: on export their pages become pictures with the boxes burned in and
 * the text under them is removed from the file. A match inside an added text box, table or
 * comment is covered as a whole, since the box cannot cover part of such an object.
 */
export function redactMatches(which: 'all' | 'current'): number {
  const s = getState();
  const { hits, index } = s.search;
  const chosen = which === 'all' ? hits : hits[index] ? [hits[index]] : [];
  if (!chosen.length) return 0;
  const existing = s.objects.filter((o): o is MaskObject => o.type === 'redact');
  const fresh: MaskObject[] = [];
  for (const hit of chosen) {
    // A little room around the letters, so no edge of a glyph peeks out.
    const box: Rect = { x: hit.x - 1.5, y: hit.y - 0.5, width: hit.width + 3, height: hit.height + 1 };
    const same = (o: MaskObject) => o.pageIndex === hit.pageIndex && contains(o, box);
    if (existing.some(same) || fresh.some(same)) continue;
    fresh.push({ id: newId(), type: 'redact', pageIndex: hit.pageIndex, ...box, fill: '#000000' });
  }
  if (!fresh.length) {
    s.toast('These matches are already covered by redaction boxes.', 'info');
    return 0;
  }
  s.commit([...s.objects, ...fresh]);
  const pages = new Set(fresh.map((f) => f.pageIndex + 1));
  getState().toast(
    `Marked ${fresh.length} match${fresh.length > 1 ? 'es' : ''} for redaction on page${pages.size > 1 ? 's' : ''} ${[...pages].join(', ')}. ` +
      'When you download, those pages become pictures and the covered text is removed from the file. Undo takes the boxes back.',
    'success',
  );
  return fresh.length;
}

export function openSearch() {
  getState().setSearch({ open: true });
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#search-query, #search-mode')?.select?.());
}

export function closeSearch() {
  run++;
  getState().setSearch({ open: false, hits: [], index: -1, busy: false });
}
