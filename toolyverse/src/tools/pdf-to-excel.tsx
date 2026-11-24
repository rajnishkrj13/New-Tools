'use client';

import { useEffect, useRef, useState } from 'react';
import { zipStore } from '@editor/engines/PdfTools';
import { isPasswordError, openPdf, type PdfDoc } from '@/lib/pdf/render';
import type { Extraction, ExtractOptions } from '@/lib/tables/extract';
import type { Box, Table } from '@/lib/tables/types';
import { XLSX_TYPE } from '@/lib/gst/excel';
import { Bench, FileDrop, Notice, Segmented, Spinner, baseName, download, type ToolProps } from './kit';
import { useQueue, NeedsPassword } from './docs/queue';
import { JobList } from './docs/JobList';
import { LanguagePicker, type LangChoice } from './docs/LanguagePicker';
import { TableEditor, type TableState } from './docs/TableEditor';
import { PageView } from './docs/PageView';

interface Result {
  doc: PdfDoc;
  extraction: Extraction;
  items: TableState[];
}

const isPdf = (b: Uint8Array) => new TextDecoder('latin1').decode(b.subarray(0, 1024)).includes('%PDF');

export default function PdfToExcel(props: ToolProps) {
  const ocrAllowed = props.features.ocr !== false;
  const [ocr, setOcr] = useState<ExtractOptions['ocr']>(ocrAllowed ? 'auto' : 'never');
  const [langs, setLangs] = useState<LangChoice>('auto');
  const [mode, setMode] = useState<ExtractOptions['mode']>('auto');
  const [join, setJoin] = useState(true);
  const [typed, setTyped] = useState(true);
  const [layout, setLayout] = useState<'tables' | 'one'>('tables');
  const [report, setReport] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [focus, setFocus] = useState<{ box?: Box; page: number } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ids = useRef(1000);
  const opts: ExtractOptions = { ocr, languages: langs, mode, join };
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const q = useQueue<Result>(async (job, report, signal) => {
    const bytes = new Uint8Array(await job.file.arrayBuffer());
    if (!isPdf(bytes)) throw new Error('This file is not a PDF.');
    report('Opening the PDF');
    let doc: PdfDoc;
    try {
      doc = await openPdf(bytes, job.password);
    } catch (e) {
      if (await isPasswordError(e)) throw new NeedsPassword(!!job.password);
      throw new Error('This PDF is damaged and cannot be read.');
    }
    const { extractTables } = await import('@/lib/tables/extract');
    try {
      const extraction = await extractTables(doc, optsRef.current, (stage, f) => report(stage, f), signal);
      const used = new Set<string>();
      const { sheetName } = await import('@/lib/tables/xlsx');
      return { doc, extraction, items: extraction.tables.map((t) => ({ table: t, include: true, sheet: sheetName(t.pages.length > 1 ? `Pages ${t.pages[0] + 1}-${t.pages[t.pages.length - 1] + 1}` : `Page ${t.pages[0] + 1} table ${t.id.slice(1)}`, used) })) };
    } catch (e) {
      void doc.destroy();
      throw e;
    } finally {
      if (signal.aborted) void doc.destroy();
    }
  });

  const job = q.jobs.find((j) => j.id === selected && j.status === 'done');
  const res = job?.result;
  const pageInfo = res?.extraction.pages[page];
  const boxes = res?.items.filter((i) => i.table.pages[0] === page).map((i) => i.table.box) ?? [];

  const build = async (r: Result, name: string) => {
    const { tablesWorkbook } = await import('@/lib/tables/xlsx');
    const chosen = r.items.filter((i) => i.include);
    if (!chosen.length) throw new Error('No table is chosen for the Excel file.');
    const plans = layout === 'one' ? chosen.map((i) => ({ table: i.table, sheet: 'Tables' })) : chosen.map((i) => ({ table: i.table, sheet: i.sheet.trim() || i.table.name }));
    // Sheet names must be unique: a repeated name gets a number.
    if (layout === 'tables') {
      const { sheetName } = await import('@/lib/tables/xlsx');
      const used = new Set<string>();
      for (const p of plans) p.sheet = sheetName(p.sheet, used);
    }
    return (await tablesWorkbook(plans, { typed, mark: true, report, source: name, warnings: r.extraction.warnings })).bytes;
  };

  const saveOne = async (id: number) => {
    const j = q.jobs.find((x) => x.id === id);
    if (!j?.result) return;
    setBusy('Writing the Excel file…');
    setError(null);
    try {
      download(await build(j.result, j.file.name), `${baseName(j.file.name)}.xlsx`, XLSX_TYPE);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const saveAll = async () => {
    setBusy('Writing the Excel files…');
    setError(null);
    try {
      const files: { name: string; bytes: Uint8Array }[] = [];
      const names = new Set<string>();
      for (const j of q.jobs.filter((x) => x.status === 'done' && x.result)) {
        if (!j.result!.items.some((i) => i.include)) continue;
        let n = `${baseName(j.file.name)}.xlsx`;
        for (let k = 2; names.has(n); k++) n = `${baseName(j.file.name)} (${k}).xlsx`;
        names.add(n);
        files.push({ name: n, bytes: await build(j.result!, j.file.name) });
      }
      if (!files.length) throw new Error('No finished file has tables to save.');
      download(zipStore(files), 'pdf-tables.zip', 'application/zip');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const setItems = (items: TableState[]) => job && q.update(job.id, { ...res!, items });
  const done = q.jobs.filter((j) => j.status === 'done');

  return (
    <div className="space-y-4">
      <Bench>
        <FileDrop accept="application/pdf,.pdf" multiple onFiles={(f) => q.add(f)} props={props} label={q.jobs.length ? 'Add more PDFs' : 'Choose PDF files'} hint="statements, invoices, ledgers, reports" />
        <div className="mt-4 grid gap-4 border-t border-rule pt-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Segmented
              label="Tables"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'auto', label: 'Find all tables' },
                { value: 'ruled', label: 'Ruled tables only' },
                { value: 'aligned', label: 'Unruled tables only' },
              ]}
            />
            <Segmented
              label="Pages"
              value={join ? 'join' : 'sep'}
              onChange={(v) => setJoin(v === 'join')}
              options={[
                { value: 'join', label: 'Join tables across pages' },
                { value: 'sep', label: 'Keep pages separate' },
              ]}
            />
            {ocrAllowed && (
              <Segmented
                label="OCR"
                value={ocr}
                onChange={setOcr}
                options={[
                  { value: 'auto', label: 'OCR scanned pages' },
                  { value: 'always', label: 'OCR every page' },
                  { value: 'never', label: 'No OCR' },
                ]}
              />
            )}
          </div>
          <div>{ocrAllowed && ocr !== 'never' && <LanguagePicker value={langs} onChange={setLangs} />}</div>
        </div>
        {q.jobs.some((j) => j.status === 'done' || j.status === 'failed') && (
          <button type="button" className="btn btn-ghost mt-3 !min-h-9 text-sm" onClick={() => q.retryAll()}>
            Read all files again with these settings
          </button>
        )}
      </Bench>

      {q.jobs.length > 0 && (
        <JobList
          jobs={q.jobs}
          selected={selected}
          onSelect={(id) => (setSelected(id), setPage(q.jobs.find((j) => j.id === id)?.result?.items[0]?.table.pages[0] ?? 0), setFocus(null))}
          onRemove={(id) => {
            const j = q.jobs.find((x) => x.id === id);
            void j?.result?.doc.destroy();
            if (selected === id) setSelected(null);
            q.remove(id);
          }}
          onRetry={q.retry}
          onCancel={q.cancel}
          onPassword={q.setPassword}
          summary={(j) => {
            const r = j.result as Result;
            const n = r.extraction.tables.length;
            return `${n} table${n === 1 ? '' : 's'} on ${r.extraction.pages.length} page${r.extraction.pages.length === 1 ? '' : 's'}`;
          }}
        />
      )}

      {done.length > 0 && (
        <Bench>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Sheets"
              value={layout}
              onChange={setLayout}
              options={[
                { value: 'tables', label: 'A sheet per table' },
                { value: 'one', label: 'All tables on one sheet' },
              ]}
            />
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={typed} onChange={(e) => setTyped(e.target.checked)} />
              Numbers and dates as Excel values
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={report} onChange={(e) => setReport(e.target.checked)} />
              Extraction report sheet
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {job && (
              <button type="button" className="btn" disabled={!!busy} onClick={() => void saveOne(job.id)}>
                Download Excel: {baseName(job.file.name)}
              </button>
            )}
            {done.length > 1 && (
              <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void saveAll()}>
                Download all {done.length} (ZIP)
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                for (const j of q.jobs) void j.result?.doc.destroy();
                q.clear();
                setSelected(null);
              }}
            >
              Clear all
            </button>
          </div>
          {busy && <Spinner text={busy} />}
          {error && <Notice tone="bad">{error}</Notice>}
          {!job && <p className="mt-2 text-sm text-ink-2">Choose Review next to a file to check its tables side by side with the PDF.</p>}
        </Bench>
      )}

      {job && res && (
        <Bench>
          {res.extraction.warnings.map((w, i) => (
            <Notice key={i} tone="warn">
              {w}
            </Notice>
          ))}
          {res.extraction.joined.length > 0 && <Notice tone="info">Joined across pages: {res.extraction.joined.join('; ')}. Choose “Keep pages separate” and read again to undo.</Notice>}
          <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div>
              <p className="label mb-1">
                Original{pageInfo?.scanned ? ` · scanned page, OCR ${pageInfo.ocr?.models.join('+')}${pageInfo.ocr?.script ? ` (${pageInfo.ocr.script} detected)` : ''}` : ''}
                {pageInfo?.scripts.length ? ` · scripts: ${pageInfo.scripts.join(', ')}` : ''}
              </p>
              <PageView doc={res.doc} page={page} pages={res.extraction.pages.length} onPage={(p) => (setPage(p), setFocus(null))} highlight={focus && focus.page === page ? focus.box : undefined} tableBoxes={boxes} rotate={pageInfo?.ocr?.rotated ?? 0} />
            </div>
            <div>
              <p className="label mb-1">Extracted tables</p>
              <TableEditor
                items={res.items}
                onChange={setItems}
                nextId={() => `t${++ids.current}`}
                onFocus={(t: Table, box, p) => {
                  setFocus({ box, page: p });
                  if (p !== page) setPage(p);
                  void t;
                }}
              />
            </div>
          </div>
        </Bench>
      )}
    </div>
  );
}
