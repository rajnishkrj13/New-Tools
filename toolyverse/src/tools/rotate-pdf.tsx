'use client';

import { useEffect, useState } from 'react';
import { openPdf, renderPage } from '@/lib/pdf/render';
import { Bench, FileDrop, Notice, Spinner, baseName, download, type ToolProps } from './kit';
import { usePdfFile } from './usePdfFile';

export default function RotatePdf(props: ToolProps) {
  const pdf = usePdfFile();
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [turns, setTurns] = useState<number[]>([]);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!pdf.bytes) return;
    let cancelled = false;
    const urls: string[] = [];
    // A new file starts unrotated, with fresh thumbnails.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTurns(Array(pdf.pages).fill(0));
    (async () => {
      setBusy('Drawing pages…');
      const doc = await openPdf(pdf.bytes!);
      // Thumbnails for up to 60 pages; larger files can still be turned all at once.
      for (let i = 0; i < Math.min(doc.numPages, 60) && !cancelled; i++) {
        const c = await renderPage(doc, i, 0.25);
        urls.push(c.toDataURL('image/jpeg', 0.7));
        if (!cancelled) setThumbs([...urls]);
      }
      await doc.destroy();
      if (!cancelled) setBusy('');
    })().catch((e) => !cancelled && (pdf.setError(e.message), setBusy('')));
    return () => {
      cancelled = true;
    };
  }, [pdf.bytes]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pdf.file || !pdf.bytes)
    return (
      <>
        <FileDrop accept="application/pdf,.pdf" onFiles={(f) => (setThumbs([]), pdf.open(f[0]))} props={props} label="Choose a PDF" />
        {pdf.error && <Notice tone="bad">{pdf.error}</Notice>}
      </>
    );

  const turn = (i: number, d: number) => setTurns(turns.map((t, j) => (j === i ? (t + d + 360) % 360 : t)));
  const all = (d: number) => setTurns(turns.map((t) => (t + d + 360) % 360));

  const save = async () => {
    setBusy('Saving…');
    try {
      const { PDFDocument, degrees } = await import('pdf-lib');
      const doc = await PDFDocument.load(pdf.bytes!, { updateMetadata: false });
      doc.getPages().forEach((p, i) => turns[i] && p.setRotation(degrees((p.getRotation().angle + turns[i]) % 360)));
      download(await doc.save(), `${baseName(pdf.file!.name)}-rotated.pdf`, 'application/pdf');
    } catch (e) {
      pdf.setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <Bench>
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mr-2">{pdf.pages} pages · all:</span>
        <button type="button" className="btn btn-ghost !min-h-9" onClick={() => all(-90)}>
          ↺ Left
        </button>
        <button type="button" className="btn btn-ghost !min-h-9" onClick={() => all(90)}>
          ↻ Right
        </button>
        <button type="button" className="btn btn-ghost !min-h-9" onClick={() => all(180)}>
          180°
        </button>
      </div>
      <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-4">
        {thumbs.map((src, i) => (
          <li key={i} className="flex flex-col items-center gap-2">
            <div className="flex h-[150px] w-full items-center justify-center bg-paper-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Page ${i + 1}`} className="max-h-[140px] max-w-[110px] border border-rule-2 shadow-sm transition-transform" style={{ transform: `rotate(${turns[i]}deg)` }} />
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className="btn btn-ghost !min-h-8 !px-2" aria-label={`Turn page ${i + 1} left`} onClick={() => turn(i, -90)}>
                ↺
              </button>
              <span className="label w-10 text-center">{i + 1}</span>
              <button type="button" className="btn btn-ghost !min-h-8 !px-2" aria-label={`Turn page ${i + 1} right`} onClick={() => turn(i, 90)}>
                ↻
              </button>
            </div>
          </li>
        ))}
      </ul>
      {pdf.pages > 60 && <p className="mt-3 text-[0.85rem] text-ink-3">Showing the first 60 pages; the “all” buttons turn every page.</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={!!busy || !turns.some(Boolean)} onClick={save}>
          Download rotated PDF
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => (pdf.reset(), setThumbs([]))}>
          Another PDF
        </button>
      </div>
      {busy && <Spinner text={busy} />}
      {pdf.error && <Notice tone="bad">{pdf.error}</Notice>}
    </Bench>
  );
}
