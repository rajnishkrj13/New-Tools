import { memo, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, FilePlus2, FileStack, RotateCcw, RotateCw, ShieldCheck, Trash2 } from 'lucide-react';
import type { PageInfo } from '../types/pdf';
import { getPdfPage, release, renderPage, type RenderHandle } from '../engines/PdfRenderer';
import { getState, useEditorStore } from '../store/documentStore';
import { setAutoSaveEnabled } from '../hooks/useAutoSave';
import { deletePage, duplicatePage, insertBlankPage, insertPdfFile, movePage, rotatePage } from '../store/pageActions';
import { CopyPlus } from 'lucide-react';

const THUMB_WIDTH = 128;
const DRAG_TYPE = 'application/x-pdf-editor-page';

function PageAction(props: { title: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      disabled={props.disabled}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
      className={`flex h-6 w-6 items-center justify-center rounded text-slate-600 hover:bg-slate-200 disabled:opacity-25 ${props.danger ? 'hover:!bg-red-100 hover:!text-red-600' : ''}`}
    >
      {props.children}
    </button>
  );
}

const Thumbnail = memo(function Thumbnail({ page, total, active, edits }: { page: PageInfo; total: number; active: boolean; edits: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dropAt, setDropAt] = useState<'before' | 'after' | null>(null);

  useEffect(() => {
    const el = ref.current!;
    let handle: RenderHandle | null = null;
    let rendered = false;
    let dead = false;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || rendered) return;
        rendered = true;
        try {
          const p = await getPdfPage(page);
          if (dead) return;
          handle = renderPage(p, page, THUMB_WIDTH / page.width, Math.min(2, window.devicePixelRatio || 1));
          const off = await handle.promise;
          const canvas = canvasRef.current;
          if (!off || dead || !canvas) return void release(off);
          canvas.width = off.width;
          canvas.height = off.height;
          canvas.getContext('2d')!.drawImage(off, 0, 0);
          release(off);
        } catch {
          rendered = false;
        }
      },
      { root: el.closest('[data-thumbs]'), rootMargin: '300px 0px' },
    );
    io.observe(el);
    return () => {
      dead = true;
      io.disconnect();
      handle?.cancel();
    };
  }, [page.id, page.rotation]);

  useEffect(() => () => void release(canvasRef.current), []);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const i = page.index;
  return (
    <div
      ref={ref}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, String(i));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        setDropAt(e.clientY < r.top + r.height / 2 ? 'before' : 'after');
      }}
      onDragLeave={() => setDropAt(null)}
      onDrop={(e) => {
        const from = Number(e.dataTransfer.getData(DRAG_TYPE));
        const where = dropAt;
        setDropAt(null);
        if (!e.dataTransfer.types.includes(DRAG_TYPE) || Number.isNaN(from)) return;
        e.preventDefault();
        e.stopPropagation();
        // Position among the remaining pages once the dragged one is lifted out.
        let to = where === 'after' ? i + 1 : i;
        if (from < to) to--;
        movePage(from, to);
      }}
      className={`group relative rounded-lg p-1.5 hover:bg-slate-100 ${
        dropAt === 'before' ? 'shadow-[0_-3px_0_0_#2f7df6]' : dropAt === 'after' ? 'shadow-[0_3px_0_0_#2f7df6]' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => getState().goToPage(i)}
        aria-label={`Go to page ${i + 1}`}
        aria-current={active ? 'page' : undefined}
        className="flex w-full flex-col items-center gap-1"
      >
        <span
          className={`relative block overflow-hidden rounded-sm bg-white shadow ring-2 ${active ? 'ring-brand-500' : 'ring-transparent group-hover:ring-slate-300'}`}
          style={{ width: THUMB_WIDTH, height: (THUMB_WIDTH * page.height) / page.width }}
        >
          <canvas ref={canvasRef} className="h-full w-full" />
          {edits > 0 && (
            <span className="absolute right-1 top-1 rounded-full bg-brand-500 px-1.5 text-[10px] font-semibold leading-4 text-white" title={`${edits} edit(s) on this page`}>
              {edits}
            </span>
          )}
        </span>
        <span className={`text-[11px] tabular-nums ${active ? 'font-semibold text-brand-700' : 'text-slate-500'}`}>{i + 1}</span>
      </button>
      <div
        className={`absolute left-1/2 top-2 -translate-x-1/2 items-center gap-0.5 rounded-md bg-white/95 p-0.5 shadow-float ${
          active ? 'flex' : 'hidden group-focus-within:flex group-hover:flex'
        }`}
        role="toolbar"
        aria-label={`Page ${i + 1} tools`}
      >
        <PageAction title="Rotate left" onClick={() => rotatePage(i, -90)}><RotateCcw size={13} /></PageAction>
        <PageAction title="Rotate right" onClick={() => rotatePage(i, 90)}><RotateCw size={13} /></PageAction>
        <PageAction title="Move up" disabled={i === 0} onClick={() => movePage(i, i - 1)}><ArrowUp size={13} /></PageAction>
        <PageAction title="Move down" disabled={i === total - 1} onClick={() => movePage(i, i + 1)}><ArrowDown size={13} /></PageAction>
        <PageAction title="Duplicate page" onClick={() => duplicatePage(i)}><CopyPlus size={13} /></PageAction>
        <PageAction title="Delete page" danger disabled={total <= 1} onClick={() => deletePage(i)}><Trash2 size={13} /></PageAction>
      </div>
    </div>
  );
});

const formatSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="truncate text-right font-medium text-slate-700" title={typeof value === 'string' ? value : undefined}>{value}</dd>
    </div>
  );
}

export function Sidebar() {
  const pages = useEditorStore((s) => s.pages);
  const doc = useEditorStore((s) => s.doc);
  const current = useEditorStore((s) => s.currentPage);
  const zoom = useEditorStore((s) => s.zoom);
  const objects = useEditorStore((s) => s.objects);
  const autoSave = useEditorStore((s) => s.autoSave);
  const pdfInput = useRef<HTMLInputElement>(null);
  if (!doc) return null;
  const counts = new Map<number, number>();
  for (const o of objects) counts.set(o.pageIndex, (counts.get(o.pageIndex) ?? 0) + 1);
  const page = pages[current];
  const mm = (pt: number) => Math.round((pt / 72) * 25.4);
  const addBtn = 'flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-50';

  return (
    <aside className="hidden w-[176px] shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pages</span>
        <div className="flex items-center gap-0.5">
          <button type="button" aria-label="Previous page" disabled={current === 0} onClick={() => getState().goToPage(current - 1)} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
            <ChevronUp size={15} />
          </button>
          <input
            aria-label="Page number"
            type="number"
            min={1}
            max={pages.length}
            value={current + 1}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v >= 1 && v <= pages.length) getState().goToPage(v - 1);
            }}
            className="h-6 w-10 rounded border border-slate-200 text-center text-xs tabular-nums"
          />
          <span className="text-xs text-slate-500">/ {pages.length}</span>
          <button type="button" aria-label="Next page" disabled={current >= pages.length - 1} onClick={() => getState().goToPage(current + 1)} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
            <ChevronDown size={15} />
          </button>
        </div>
      </div>
      <div data-thumbs className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {pages.map((p) => (
          <Thumbnail key={p.id} page={p} total={pages.length} active={p.index === current} edits={counts.get(p.index) ?? 0} />
        ))}
      </div>
      <div className="flex gap-1.5 border-t border-slate-100 px-2 py-2">
        <button type="button" className={addBtn} title={`Insert an empty page after page ${current + 1}`} onClick={() => insertBlankPage(current)}>
          <FilePlus2 size={13} /> Blank page
        </button>
        <button type="button" className={addBtn} title={`Insert the pages of another PDF after page ${current + 1}`} onClick={() => pdfInput.current?.click()}>
          <FileStack size={13} /> Add PDF
        </button>
        <input
          ref={pdfInput}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) insertPdfFile(f, getState().currentPage);
          }}
        />
      </div>
      <dl className="space-y-1 border-t border-slate-100 px-3 py-2.5 text-[11px]">
        <Info label="File" value={doc.fileName} />
        <Info label="Size" value={formatSize(doc.fileSize)} />
        <Info label="Pages" value={pages.length} />
        {page && <Info label="Page size" value={`${mm(page.width)} × ${mm(page.height)} mm`} />}
        {page && page.rotation !== 0 && <Info label="Rotation" value={`${page.rotation}°`} />}
        {doc.pdfVersion && <Info label="PDF version" value={doc.pdfVersion} />}
        <Info label="Zoom" value={`${Math.round(zoom * 100)}%`} />
      </dl>
      <label
        className="flex cursor-pointer items-start gap-2 border-t border-slate-100 px-3 py-2 text-[11px] leading-snug text-slate-600"
        title="Keeps the document and your edits in this browser so you can continue after closing the tab. Switching it off erases the stored copy."
      >
        <input type="checkbox" className="mt-0.5" checked={autoSave.enabled} onChange={(e) => setAutoSaveEnabled(e.target.checked)} />
        <span>
          <span className="font-medium text-slate-700">Auto-save in this browser</span>
          <br />
          {!autoSave.enabled
            ? 'Off. Nothing is kept after you close the tab.'
            : autoSave.status === 'error'
              ? 'Not working. Download your PDF to keep it.'
              : autoSave.at
                ? `Saved ${new Date(autoSave.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'On'}
        </span>
      </label>
      <div className="flex items-start gap-1.5 border-t border-slate-100 bg-emerald-50/60 px-3 py-2 text-[11px] leading-snug text-emerald-800">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        <span>Your PDF stays on this device. Nothing is uploaded.</span>
      </div>
    </aside>
  );
}
