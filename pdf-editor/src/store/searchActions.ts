import type { SearchHit } from '../types/editor';
import type { TextEditObject } from '../types/objects';
import { getPdfPage } from '../engines/PdfRenderer';
import { loadTextModel } from '../engines/PdfTextExtractor';
import { layoutTextObject } from '../engines/TextEditLayout';
import { findInText } from '../engines/TextSearch';
import { getState } from './documentStore';
import { editParagraphText, findParagraph, liveSlots } from './textEditActions';

/**
 * Find and replace across the whole document: the text of the PDF (as it currently
 * reads, edits included) and the text boxes that were added. A match lies within one line.
 */

async function collectHits(query: string, matchCase: boolean): Promise<SearchHit[]> {
  const s = getState();
  const hits: SearchHit[] = [];
  if (!query) return hits;
  for (const page of s.pages) {
    const model = await loadTextModel(await getPdfPage(page), page);
    const objects = getState().objects;
    const edits = new Map<string, TextEditObject>();
    for (const o of objects) if (o.type === 'textedit' && o.pageIndex === page.index) edits.set(o.paragraphId, o);
    for (const para of model.paragraphs) {
      for (const slot of liveSlots(para, edits.get(para.id))) {
        for (const start of findInText(slot.text, query, matchCase)) {
          const end = start + query.length;
          const cx = slot.charX;
          hits.push({
            pageIndex: page.index, x: cx[start], y: slot.top, width: cx[end] - cx[start], height: slot.bottom - slot.top,
            target: { kind: 'page', paragraphId: para.id, slot: slot.index, start, end },
          });
        }
      }
    }
    for (const o of objects) {
      if (o.type !== 'text' || o.pageIndex !== page.index) continue;
      for (const start of findInText(o.text, query, matchCase)) {
        hits.push({
          pageIndex: page.index, x: o.x, y: o.y, width: o.width, height: layoutTextObject(o).height,
          target: { kind: 'object', id: o.id, start, end: start + query.length },
        });
      }
    }
  }
  // Reading order: page, then top to bottom, then left to right.
  return hits.sort((a, b) => a.pageIndex - b.pageIndex || a.y - b.y || a.x - b.x);
}

let run = 0;

/** Searches again with the current query and keeps the position in the result list where possible. */
export async function runSearch(keepIndex = false) {
  const s = getState();
  const { query, matchCase } = s.search;
  const mine = ++run;
  if (!query) return s.setSearch({ hits: [], index: -1, busy: false });
  s.setSearch({ busy: true });
  try {
    const hits = await collectHits(query, matchCase);
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

function applyReplace(hit: SearchHit, replacement: string, key: string | null): boolean {
  const s = getState();
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
  applyReplace(hit, replace, null);
  await runSearch(true);
  const now = getState().search;
  if (now.hits.length) showHit(Math.min(index, now.hits.length - 1));
}

export async function replaceAll() {
  const { query, matchCase, replace } = getState().search;
  const hits = await collectHits(query, matchCase);
  if (!hits.length) return;
  // Last match first: a replacement only re-flows what comes after it, so earlier matches stay where they are.
  const ordered = [...hits].sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return b.pageIndex - a.pageIndex;
    const sa = a.target.kind === 'page' ? a.target.slot : 0;
    const sb = b.target.kind === 'page' ? b.target.slot : 0;
    return sb - sa || b.target.start - a.target.start;
  });
  let done = 0;
  for (const hit of ordered) if (applyReplace(hit, replace, 'replace-all')) done++;
  getState().toast(`Replaced ${done} occurrence${done === 1 ? '' : 's'}.`, 'success');
  await runSearch();
}

export function openSearch() {
  getState().setSearch({ open: true });
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#search-query')?.select());
}

export function closeSearch() {
  run++;
  getState().setSearch({ open: false, hits: [], index: -1, busy: false });
}
