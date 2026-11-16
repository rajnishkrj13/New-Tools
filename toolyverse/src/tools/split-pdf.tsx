'use client';

import { useState } from 'react';
import { groupLabel, splitGroups, zipStore, type SplitSpec } from '@editor/engines/PdfTools';
import { Bench, FileDrop, Notice, Spinner, baseName, download, type ToolProps } from './kit';
import { usePdfFile } from './usePdfFile';

type Mode = 'every' | 'single' | 'ranges';
const describe = (g: number[]) => (g.length === 1 ? `${g[0] + 1}` : g.every((p, k) => !k || p === g[k - 1] + 1) ? `${g[0] + 1}–${g[g.length - 1] + 1}` : `${g.length} pages`);

export default function SplitPdf(props: ToolProps) {
  const pdf = usePdfFile();
  const [mode, setMode] = useState<Mode>('every');
  const [size, setSize] = useState('1');
  const [ranges, setRanges] = useState('');
  const [rest, setRest] = useState(false);
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState<string | null>(null);

  if (!pdf.file || !pdf.bytes)
    return (
      <>
        <FileDrop accept="application/pdf,.pdf" onFiles={(f) => pdf.open(f[0])} props={props} label="Choose a PDF" />
        {pdf.error && <Notice tone="bad">{pdf.error}</Notice>}
      </>
    );

  const count = pdf.pages;
  const spec: SplitSpec = mode === 'ranges' ? { mode: 'ranges', text: ranges, rest } : { mode: 'every', size: mode === 'single' ? 1 : Number(size) };
  const groups = splitGroups(spec, count);

  const run = async () => {
    if (!groups || !pdf.bytes || !pdf.file) return;
    setDone(null);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const src = await PDFDocument.load(pdf.bytes, { updateMetadata: false });
      const files: { name: string; bytes: Uint8Array }[] = [];
      for (const [i, g] of groups.entries()) {
        setBusy(`Making file ${i + 1} of ${groups.length}…`);
        const out = await PDFDocument.create();
        for (const p of await out.copyPages(src, g)) out.addPage(p);
        files.push({ name: `${baseName(pdf.file.name)}-${groupLabel(g, i)}.pdf`, bytes: await out.save() });
      }
      if (files.length === 1) download(files[0].bytes, files[0].name, 'application/pdf');
      else download(zipStore(files), `${baseName(pdf.file.name)}-split.zip`, 'application/zip');
      setDone(files.length === 1 ? `Saved ${files[0].name}.` : `Saved ${files.length} PDFs in one ZIP file.`);
    } catch (e) {
      pdf.setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const radio = (v: Mode, label: React.ReactNode) => (
    <label className="flex items-center gap-2.5 text-[0.98rem]">
      <input type="radio" name="split" checked={mode === v} onChange={() => setMode(v)} />
      {label}
    </label>
  );

  return (
    <Bench>
      <p className="label">
        {pdf.file.name} · {count} pages
      </p>
      <div className="mt-4 space-y-3">
        {radio(
          'every',
          <span className="flex items-center gap-2">
            Every
            <input aria-label="Pages per file" type="number" min={1} max={count} value={size} onFocus={() => setMode('every')} onChange={(e) => setSize(e.target.value)} className="field !min-h-9 !w-20" />
            pages
          </span>,
        )}
        {radio('single', 'Every page as its own file')}
        {radio('ranges', 'By page ranges')}
        {mode === 'ranges' && (
          <div className="ml-7 space-y-2">
            <input aria-label="Page ranges" className="field max-w-md" value={ranges} onChange={(e) => setRanges(e.target.value)} placeholder={`1-3, 4-8, 9-${count}`} />
            <p className="text-[0.85rem] text-ink-3">Commas separate the files. “9-” means page 9 to the end.</p>
            <label className="flex items-center gap-2 text-[0.92rem]">
              <input type="checkbox" checked={rest} onChange={(e) => setRest(e.target.checked)} /> Put the pages not listed in one more file
            </label>
          </div>
        )}
      </div>
      <p className={`mt-5 border-l-[3px] px-3 py-2 text-[0.92rem] ${groups ? 'border-ink bg-paper-2' : 'border-bad text-bad'}`} aria-live="polite">
        {groups
          ? `Makes ${groups.length} file${groups.length > 1 ? 's' : ''}: ${groups.slice(0, 10).map(describe).join(' · ')}${groups.length > 10 ? ` · … ${groups.length - 10} more` : ''}`
          : mode === 'ranges'
            ? `Use page numbers from 1 to ${count}, for example 1-3, 4-8.`
            : 'Enter a whole number of pages.'}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={!groups || !!busy} onClick={run}>
          Split and download
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => (pdf.reset(), setDone(null))}>
          Another PDF
        </button>
      </div>
      {busy && <Spinner text={busy} />}
      {pdf.error && <Notice tone="bad">{pdf.error}</Notice>}
      {done && <Notice tone="ok">{done}</Notice>}
    </Bench>
  );
}
