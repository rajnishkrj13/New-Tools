import { useEffect, useLayoutEffect, useRef } from 'react';
import { getState, useEditorStore } from '../store/documentStore';
import { PdfPage } from './PdfPage';

/** Scrollable workspace with every page stacked vertically and centred. */
export function PdfViewer() {
  const pages = useEditorStore((s) => s.pages);
  const zoom = useEditorStore((s) => s.zoom);
  const scrollRequest = useEditorStore((s) => s.scrollRequest);
  const ref = useRef<HTMLDivElement>(null);
  const prevZoom = useRef(zoom);

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => getState().setViewerSize(el.clientWidth, el.clientHeight));
    ro.observe(el);
    getState().setViewerSize(el.clientWidth, el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Keep the same part of the document in view when the zoom changes.
  useLayoutEffect(() => {
    const el = ref.current!;
    const k = zoom / prevZoom.current;
    if (k !== 1) {
      el.scrollTop = (el.scrollTop + el.clientHeight / 2) * k - el.clientHeight / 2;
      el.scrollLeft = (el.scrollLeft + el.clientWidth / 2) * k - el.clientWidth / 2;
    }
    prevZoom.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (!scrollRequest) return;
    const el = ref.current!;
    const target = el.querySelector<HTMLElement>(`[data-page="${scrollRequest.page}"]`);
    if (target) {
      el.scrollTo({
        top: target.offsetTop - 16,
        // Centre the page; when it is wider than the view, start at its left edge instead.
        left: target.offsetWidth > el.clientWidth ? target.offsetLeft - 16 : Math.max(0, target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2),
        behavior: 'auto',
      });
    }
  }, [scrollRequest]);

  useEffect(() => {
    const el = ref.current!;
    let raf = 0;
    const update = () => {
      raf = 0;
      const mid = el.scrollTop + el.clientHeight / 2;
      let best = 0;
      el.querySelectorAll<HTMLElement>('[data-page]').forEach((p) => {
        if (p.offsetTop <= mid) best = Number(p.dataset.page);
      });
      if (best !== getState().currentPage) getState().setCurrentPage(best);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Ctrl + wheel zooms the document instead of the whole browser page.
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      getState().zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div ref={ref} data-viewer className="relative min-h-0 flex-1 overflow-auto bg-workspace">
      <div className="flex min-w-max flex-col items-center gap-5 px-8 py-6">
        {pages.map((p) => (
          <PdfPage key={p.index} page={p} />
        ))}
      </div>
    </div>
  );
}
