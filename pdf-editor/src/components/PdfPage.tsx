import { memo, useEffect, useRef, useState } from 'react';
import type { PageInfo } from '../types/pdf';
import { getPdfPage, pageCanvases, release, renderPage, type RenderHandle } from '../engines/PdfRenderer';
import { insertImageFile } from '../hooks/usePdfDocument';
import { useEditorStore } from '../store/documentStore';
import { IMAGE_TYPES } from '../utils/validationUtils';
import { InlineTextEditor } from './InlineTextEditor';
import { TableCellEditor } from './TableCellEditor';
import { ObjectLayer } from './ObjectLayer';
import { FormLayer } from './FormLayer';
import { SearchHighlights } from './SearchPanel';
import { TextEditLayer } from './TextEditor';

/**
 * One page: the PDF.js canvas at the bottom, the interactive object layer above it and,
 * for the Edit Text tool, the text layer on top. Only pages near the viewport are
 * rendered; a page that scrolls away gives its canvas memory back.
 */
export const PdfPage = memo(function PdfPage({ page }: { page: PageInfo }) {
  const zoom = useEditorStore((s) => s.zoom);
  const tool = useEditorStore((s) => s.tool);
  const editing = useEditorStore((s) => {
    if (s.draftText?.pageIndex === page.index) return s.draftText;
    const o = s.editingTextId ? s.objects.find((x) => x.id === s.editingTextId) : undefined;
    return o && o.type === 'text' && o.pageIndex === page.index ? o : null;
  });
  const cellTable = useEditorStore((s) => {
    const o = s.editingCell ? s.objects.find((x) => x.id === s.editingCell!.id) : undefined;
    return o && o.type === 'table' && o.pageIndex === page.index ? o : null;
  });
  const editingCell = useEditorStore((s) => s.editingCell);
  const isNew = useEditorStore((s) => s.draftText?.pageIndex === page.index);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    const el = wrapRef.current!;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: el.closest('[data-viewer]'),
      rootMargin: '900px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    if (!visible) {
      release(canvas);
      pageCanvases.delete(page.id);
      return;
    }
    let dead = false;
    let handle: RenderHandle | null = null;
    // While zooming, the old bitmap is stretched by CSS; re-render once the zoom settles.
    const timer = setTimeout(
      async () => {
        try {
          const p = await getPdfPage(page);
          if (dead) return;
          setBusy(true);
          handle = renderPage(p, page, zoom);
          const off = await handle.promise;
          if (!off || dead) return void release(off);
          canvas.width = off.width;
          canvas.height = off.height;
          canvas.getContext('2d')!.drawImage(off, 0, 0);
          release(off);
          pageCanvases.set(page.id, canvas);
          setFailed(null);
        } catch (e: any) {
          if (!dead) setFailed(e?.message ?? 'This page could not be rendered.');
        } finally {
          if (!dead) setBusy(false);
        }
      },
      canvas.width ? 140 : 0,
    );
    return () => {
      dead = true;
      clearTimeout(timer);
      handle?.cancel();
    };
    // Only the page's identity and rotation decide its picture, not its position in the document.
  }, [visible, zoom, page.id, page.rotation]);

  useEffect(
    () => () => {
      release(canvasRef.current);
      pageCanvases.delete(page.id);
    },
    [page.id],
  );

  const hasImages = (e: React.DragEvent) => Array.from(e.dataTransfer.items ?? []).some((i) => i.kind === 'file' && IMAGE_TYPES.includes(i.type));

  return (
    <div
      ref={wrapRef}
      data-page={page.index}
      className={`relative shrink-0 bg-white shadow-page ${dropping ? 'ring-2 ring-brand-500' : ''}`}
      style={{ width: page.width * zoom, height: page.height * zoom }}
      onDragOver={(e) => {
        if (!hasImages(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        const files = Array.from(e.dataTransfer.files).filter((f) => IMAGE_TYPES.includes(f.type));
        setDropping(false);
        if (!files.length) return;
        e.preventDefault();
        e.stopPropagation();
        const r = wrapRef.current!.getBoundingClientRect();
        const at = { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
        files.forEach((f, i) => insertImageFile(f, page.index, { x: at.x + i * 14, y: at.y + i * 14 }));
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label={`Page ${page.index + 1}`} />
      {busy && !canvasRef.current?.width && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Rendering page {page.index + 1}…</div>
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-600">
          Page {page.index + 1} could not be rendered: {failed}
        </div>
      )}
      {visible && <ObjectLayer page={page} />}
      {visible && <FormLayer page={page} />}
      <SearchHighlights page={page} />
      {visible && tool === 'edittext' && <TextEditLayer page={page} />}
      {editing && <InlineTextEditor key={editing.id} obj={editing} isNew={!!isNew} />}
      {cellTable && editingCell && (
        <TableCellEditor key={`${editingCell.id}:${editingCell.row}:${editingCell.col}`} table={cellTable} row={editingCell.row} col={editingCell.col} />
      )}
    </div>
  );
});
