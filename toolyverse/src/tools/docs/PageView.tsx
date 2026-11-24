'use client';

import { useEffect, useRef, useState } from 'react';
import { renderPage, type PdfDoc } from '@/lib/pdf/render';
import type { Box } from '@/lib/tables/types';

/**
 * One page of the PDF, drawn at the chosen zoom, with the source of the selected cell outlined.
 * `rotate` turns scanned pages the way they were turned for reading.
 */
export function PageView({ doc, page, pages, onPage, highlight, tableBoxes, rotate = 0 }: { doc: PdfDoc; page: number; pages: number; onPage: (p: number) => void; highlight?: Box; tableBoxes?: Box[]; rotate?: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState<{ w: number; h: number; scale: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    const width = holder.current?.clientWidth || 520;
    (async () => {
      try {
        const p = await doc.getPage(page + 1);
        const vp = p.getViewport({ scale: 1, rotation: (p.rotate + rotate) % 360 });
        const scale = ((width - 4) / vp.width) * zoom;
        const canvas = await renderPage(doc, page, scale * (window.devicePixelRatio || 1), rotate);
        if (dead || !holder.current) return;
        canvas.style.width = `${vp.width * scale}px`;
        canvas.style.height = `${vp.height * scale}px`;
        canvas.style.display = 'block';
        const old = holder.current.querySelector('canvas');
        if (old) {
          (old as HTMLCanvasElement).width = 0;
          old.remove();
        }
        holder.current.prepend(canvas);
        setSize({ w: vp.width * scale, h: vp.height * scale, scale });
        setError(null);
      } catch (e) {
        if (!dead) setError((e as Error).message);
      }
    })();
    return () => {
      dead = true;
    };
  }, [doc, page, zoom, rotate]);

  const box = (b: Box, color: string, fill = false) =>
    size && (
      <div
        className="pointer-events-none absolute"
        style={{ left: b.x0 * size.scale - 2, top: b.y0 * size.scale - 2, width: (b.x1 - b.x0) * size.scale + 4, height: (b.y1 - b.y0) * size.scale + 4, border: `2px solid ${color}`, background: fill ? 'rgba(212,69,42,0.15)' : undefined }}
      />
    );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className="border border-rule px-2 py-0.5 disabled:opacity-40" disabled={page <= 0} onClick={() => onPage(page - 1)} aria-label="Previous page">
          ‹
        </button>
        <span className="label">
          Page {page + 1} of {pages}
        </span>
        <button type="button" className="border border-rule px-2 py-0.5 disabled:opacity-40" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">
          ›
        </button>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className="border border-rule px-2 py-0.5" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out">
            −
          </button>
          <span className="label w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button type="button" className="border border-rule px-2 py-0.5" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in">
            +
          </button>
        </span>
      </div>
      <div className="max-h-[40rem] overflow-auto border border-rule bg-paper-2">
        <div ref={holder} className="relative" style={size ? { width: size.w, height: size.h } : { minHeight: 300 }}>
          {tableBoxes?.map((b, i) => <span key={i}>{box(b, 'rgba(31,92,116,0.55)')}</span>)}
          {highlight && box(highlight, 'var(--signal)', true)}
        </div>
      </div>
      {error && <p className="mt-1 text-sm text-bad">The page could not be drawn: {error}</p>}
    </div>
  );
}
