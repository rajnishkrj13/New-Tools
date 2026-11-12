import { useEffect, useMemo, useRef, useState } from 'react';
import type { TextEditObject, TextStyle } from '../types/objects';
import type { PageInfo } from '../types/pdf';
import type { EditLevel, PageTextModel, Paragraph } from '../types/text';
import { resolvePdfFont } from '../engines/FontManager';
import { getPdfPage } from '../engines/PdfRenderer';
import { getCachedTextModel, loadTextModel } from '../engines/PdfTextExtractor';
import type { Slot } from '../engines/TextEditLayout';
import { getState, useEditorStore } from '../store/documentStore';
import { editParagraphText, findParagraph, findTextEdit, liveSlots } from '../store/textEditActions';
import { cssFont, measureText } from '../utils/fontUtils';
import { FloatingTextToolbar } from './FloatingTextToolbar';

interface LivePara {
  para: Paragraph;
  edit?: TextEditObject;
  slots: Slot[];
}

/** Style the paragraph is (or would be) drawn with. */
export function paragraphStyle(para: Paragraph, edit?: TextEditObject): TextStyle & { match: string; originalName: string } {
  if (edit) return { ...edit.style, match: edit.fontMatch, originalName: edit.origFontName };
  const main = para.lines.reduce((a, b) => (b.text.length > a.text.length ? b : a));
  const f = resolvePdfFont(main.realFontName, main.generic);
  return {
    fontFamily: f.family, fontSize: para.fontSize, bold: f.bold, italic: f.italic, underline: false,
    color: '#111111', align: 'left', opacity: 1, match: f.match, originalName: f.originalName,
  };
}

/** Character range to edit for a click on character `k`, by editing level. */
function rangeFor(slot: Slot, k: number, level: EditLevel): [number, number] {
  const text = slot.text;
  if (level === 'line') return [0, text.length];
  // Letter editing needs trustworthy character boxes; otherwise fall back to the word.
  if (level === 'char' && slot.reliableChars && /\S/.test(text[k] ?? '')) return [k, k + 1];
  let i = k;
  if (/\s/.test(text[i] ?? ' ')) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) i = Math.max(0, text.trimEnd().length - 1);
  }
  let start = i;
  let end = i;
  while (start > 0 && /\S/.test(text[start - 1])) start--;
  while (end < text.length && /\S/.test(text[end])) end++;
  return [start, end];
}

/**
 * Click-to-edit layer for the text that is already in the PDF. It sits above the page
 * canvas only while the Edit Text tool is active.
 */
export function TextEditLayer({ page }: { page: PageInfo }) {
  const zoom = useEditorStore((s) => s.zoom);
  const level = useEditorStore((s) => s.editLevel);
  const textSel = useEditorStore((s) => s.textSel);
  const objects = useEditorStore((s) => s.objects);
  useEditorStore((s) => s.fontVersion);
  const [model, setModel] = useState<PageTextModel | null>(getCachedTextModel(page.index) ?? null);
  const [hover, setHover] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const ref = useRef<HTMLDivElement>(null);
  draftRef.current = draft;

  useEffect(() => {
    let dead = false;
    setModel(getCachedTextModel(page.index) ?? null);
    getPdfPage(page)
      .then((p) => loadTextModel(p, page))
      .then((m) => !dead && setModel(m))
      .catch(() => !dead && getState().toast(`The text of page ${page.index + 1} could not be read.`, 'error'));
    return () => {
      dead = true;
    };
  }, [page]);

  const build = (list = objects): LivePara[] => {
    if (!model) return [];
    const edits = new Map<string, TextEditObject>();
    for (const o of list) if (o.type === 'textedit' && o.pageIndex === page.index) edits.set(o.paragraphId, o);
    return model.paragraphs.map((para) => ({ para, edit: edits.get(para.id), slots: liveSlots(para, edits.get(para.id)) }));
  };
  const paras = useMemo(() => build(), [model, objects]);

  const hitTest = (list: LivePara[], clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    const x = (clientX - r.left) / zoom;
    const y = (clientY - r.top) / zoom;
    for (const lp of list) {
      for (const slot of lp.slots) {
        if (y < slot.top - 1 || y > slot.bottom + 1 || !slot.text.trim()) continue;
        const cx = slot.charX;
        if (x < cx[0] - 3 || x > cx[cx.length - 1] + 3) continue;
        let k = 0;
        while (k < slot.text.length - 1 && cx[k + 1] <= x) k++;
        return { lp, slot, k };
      }
    }
    return null;
  };

  const sel = textSel && textSel.pageIndex === page.index ? textSel : null;
  const selPara = sel ? paras.find((p) => p.para.id === sel.paragraphId) : undefined;
  const selSlot = selPara?.slots[sel!.slot];

  /** Writes the text being typed into the document and keeps the line selected. */
  const commitDraft = () => {
    const s = getState().textSel;
    if (!s || !s.editing || s.pageIndex !== page.index) return;
    const para = findParagraph(s.pageIndex, s.paragraphId);
    if (!para) return getState().setTextSel(null);
    editParagraphText(para, s.slot, s.start, s.end, draftRef.current);
    const slots = liveSlots(para, findTextEdit(para.id));
    if (!slots.length) return getState().setTextSel(null);
    const i = Math.min(s.slot, slots.length - 1);
    getState().setTextSel({ ...s, slot: i, start: 0, end: slots[i].text.length, editing: false });
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    commitDraft();
    const hit = hitTest(build(getState().objects), e.clientX, e.clientY);
    if (!hit) return getState().setTextSel(null);
    e.preventDefault();
    const [start, end] = rangeFor(hit.slot, hit.k, level);
    setDraft(hit.slot.text.slice(start, end));
    setHover(null);
    getState().setTextSel({ pageIndex: page.index, paragraphId: hit.lp.para.id, slot: hit.slot.index, start, end, editing: true });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const hit = hitTest(paras, e.clientX, e.clientY);
    if (!hit) return hover && setHover(null);
    const [start, end] = rangeFor(hit.slot, hit.k, level);
    const cx = hit.slot.charX;
    const next = { x: cx[start], y: hit.slot.top, w: cx[end] - cx[start], h: hit.slot.bottom - hit.slot.top };
    if (!hover || hover.x !== next.x || hover.y !== next.y || hover.w !== next.w) setHover(next);
  };

  let editor: React.ReactNode = null;
  let highlight: React.ReactNode = null;
  if (sel && selPara && selSlot) {
    const style = paragraphStyle(selPara.para, selPara.edit);
    const cx = selSlot.charX;
    const start = Math.min(sel.start, selSlot.text.length);
    const end = Math.min(sel.end, selSlot.text.length);
    const left = cx[start] * zoom;
    const top = selSlot.top * zoom;
    const height = (selSlot.bottom - selSlot.top) * zoom;
    const rangeW = (cx[end] - cx[start]) * zoom;
    if (sel.editing) {
      const font = { ...style, fontSize: selSlot.fontSize };
      const typed = measureText(draft, font) * zoom;
      editor = (
        <input
          key={`${sel.paragraphId}:${sel.slot}:${sel.start}:${sel.end}`}
          autoFocus
          spellCheck={false}
          aria-label="Edit text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onMouseDown={(e) => e.stopPropagation()}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitDraft();
              getState().setTextSel(null);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              getState().setTextSel(null);
            }
          }}
          className="absolute z-20 m-0 rounded-sm border-0 p-0 outline outline-2 outline-brand-500"
          style={{
            left: left - 1,
            top,
            height,
            width: Math.max(rangeW, typed) + 16,
            font: cssFont({ ...font, fontSize: selSlot.fontSize * zoom }),
            lineHeight: `${height}px`,
            color: style.color,
            background: selPara.edit?.maskColor ?? '#ffffff',
            paddingLeft: 1,
          }}
        />
      );
    } else {
      highlight = (
        <div
          className="pointer-events-none absolute rounded-sm bg-brand-500/15 outline outline-1 outline-brand-500"
          style={{ left, top, width: Math.max(4, rangeW), height }}
        />
      );
    }
  }

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-10 cursor-text select-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHover(null)}
    >
      {!model && <div className="absolute left-2 top-2 rounded bg-white/90 px-2 py-1 text-xs text-slate-500 shadow">Reading text…</div>}
      {model && model.lines.length === 0 && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800 shadow">
          {model.skipped > 0
            ? 'The text on this page is rotated and cannot be edited in place. Use Whiteout and Add Text instead.'
            : 'This page has no editable text (it may be a scan). Use Whiteout and Add Text instead.'}
        </div>
      )}
      {hover && !(sel?.editing) && (
        <div
          className="pointer-events-none absolute rounded-sm outline-dashed outline-1 outline-brand-500/80"
          style={{ left: hover.x * zoom - 1, top: hover.y * zoom, width: hover.w * zoom + 2, height: hover.h * zoom }}
        />
      )}
      {highlight}
      {editor}
      {sel && selPara && selSlot && (
        <FloatingTextToolbar
          para={selPara.para}
          edit={selPara.edit}
          anchor={{ x: selSlot.charX[Math.min(sel.start, selSlot.text.length)] * zoom, top: selSlot.top * zoom, bottom: selSlot.bottom * zoom }}
          pageWidth={page.width * zoom}
          beforeChange={commitDraft}
          onDelete={() => {
            const s = getState().textSel;
            if (!s) return;
            // Deleting replaces the selected range by nothing, whatever was typed.
            draftRef.current = '';
            if (s.editing) commitDraft();
            else editParagraphText(selPara.para, s.slot, s.start, s.end, '');
            getState().setTextSel(null);
          }}
          onConfirm={() => {
            commitDraft();
            getState().setTextSel(null);
          }}
        />
      )}
    </div>
  );
}
