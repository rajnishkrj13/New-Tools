'use client';

import { useRef, useState } from 'react';
import { zipStore } from '@editor/engines/PdfTools';
import type { DocxRead } from '@/lib/docx/read';
import { cell, type Table } from '@/lib/tables/types';
import { isRtl, mainScripts } from '@/lib/lang';
import { XLSX_TYPE } from '@/lib/gst/excel';
import { Bench, FileDrop, Notice, Segmented, Spinner, baseName, download, type ToolProps } from './kit';
import { useQueue } from './docs/queue';
import { JobList } from './docs/JobList';
import { TableEditor, type TableState } from './docs/TableEditor';

interface Result {
  read: DocxRead;
  items: TableState[];
}

/** Headings, paragraphs and list items as a table for their own sheet. */
function textTable(read: DocxRead): Table {
  const rows = [[cell('Type', { bold: true }), cell('Level', { bold: true }), cell('Text', { bold: true })]];
  for (const b of read.blocks) rows.push([cell(b.kind === 'heading' ? 'Heading' : b.kind === 'list' ? (b.list === 'bullet' ? 'Bullet item' : 'Numbered item') : 'Paragraph'), cell(b.level ? String(b.level) : ''), cell(b.text)]);
  // The sheet reads right to left when the document's own text does (its labels are English).
  const rtl = isRtl(read.blocks.map((b) => b.text).join(' '));
  return { id: 'text', name: 'Text outside tables', pages: [0], box: { x0: 0, y0: 0, x1: 0, y1: 0 }, rows, rtl, headerRows: 1, method: 'word', confidence: { table: 100, rows: 100, cols: 100, cells: 100 }, notes: [] };
}

export default function WordToExcel(props: ToolProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [withText, setWithText] = useState(false);
  const [typed, setTyped] = useState(true);
  const [layout, setLayout] = useState<'tables' | 'one'>('tables');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ids = useRef(1000);

  const q = useQueue<Result>(async (job, report) => {
    if (!/\.docx$/i.test(job.file.name) && !/wordprocessingml/.test(job.file.type)) {
      if (/\.doc$/i.test(job.file.name)) throw new Error('Old .doc files cannot be read: open it in Word and save it as .docx.');
    }
    const bytes = new Uint8Array(await job.file.arrayBuffer());
    report('Reading the document');
    const { readDocx } = await import('@/lib/docx/read');
    const read = await readDocx(bytes);
    report('Preparing the tables', 0.8);
    const { sheetName } = await import('@/lib/tables/xlsx');
    const used = new Set<string>();
    return { read, items: read.tables.map((t) => ({ table: t, include: true, sheet: sheetName(t.name, used) })) };
  });

  const job = q.jobs.find((j) => j.id === selected && j.status === 'done');
  const res = job?.result;

  const build = async (r: Result, name: string) => {
    const { tablesWorkbook, sheetName } = await import('@/lib/tables/xlsx');
    const chosen = r.items.filter((i) => i.include);
    if (!chosen.length && !(withText && r.read.blocks.length)) throw new Error('No table is chosen for the Excel file.');
    const used = new Set<string>();
    const plans = layout === 'one' ? chosen.map((i) => ({ table: i.table, sheet: 'Tables' })) : chosen.map((i) => ({ table: i.table, sheet: sheetName(i.sheet.trim() || i.table.name, used) }));
    if (withText && r.read.blocks.length) plans.push({ table: textTable(r.read), sheet: sheetName('Text', used) });
    return (await tablesWorkbook(plans, { typed, mark: false, report: false, source: name })).bytes;
  };

  const save = async (ids2: number[], zip: boolean) => {
    setBusy('Writing the Excel file…');
    setError(null);
    try {
      const files: { name: string; bytes: Uint8Array }[] = [];
      const names = new Set<string>();
      for (const id of ids2) {
        const j = q.jobs.find((x) => x.id === id);
        if (!j?.result) continue;
        let n = `${baseName(j.file.name)}.xlsx`;
        for (let k = 2; names.has(n); k++) n = `${baseName(j.file.name)} (${k}).xlsx`;
        names.add(n);
        files.push({ name: n, bytes: await build(j.result, j.file.name) });
      }
      if (!files.length) throw new Error('No finished file to save.');
      if (zip) download(zipStore(files), 'word-tables.zip', 'application/zip');
      else download(files[0].bytes, files[0].name, XLSX_TYPE);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const done = q.jobs.filter((j) => j.status === 'done');
  const scripts = res ? mainScripts([...res.read.tables.flatMap((t) => t.rows.flat().map((c) => c.text)), ...res.read.blocks.map((b) => b.text)].join(' ')) : [];

  return (
    <div className="space-y-4">
      <Bench>
        <FileDrop accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple onFiles={(f) => q.add(f)} props={props} label={q.jobs.length ? 'Add more Word files' : 'Choose Word files'} hint=".docx" />
      </Bench>

      {q.jobs.length > 0 && (
        <JobList
          jobs={q.jobs}
          selected={selected}
          onSelect={setSelected}
          onRemove={(id) => {
            if (selected === id) setSelected(null);
            q.remove(id);
          }}
          onRetry={q.retry}
          onCancel={q.cancel}
          onPassword={q.setPassword}
          summary={(j) => {
            const r = j.result as Result;
            return `${r.read.tables.length} table${r.read.tables.length === 1 ? '' : 's'}, ${r.read.blocks.length} paragraphs`;
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
              <input type="checkbox" checked={withText} onChange={(e) => setWithText(e.target.checked)} />
              Headings, paragraphs and lists on a “Text” sheet
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={typed} onChange={(e) => setTyped(e.target.checked)} />
              Numbers and dates as Excel values
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {job && (
              <button type="button" className="btn" disabled={!!busy} onClick={() => void save([job.id], false)}>
                Download Excel: {baseName(job.file.name)}
              </button>
            )}
            {done.length > 1 && (
              <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void save(done.map((j) => j.id), true)}>
                Download all {done.length} (ZIP)
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => (q.clear(), setSelected(null))}>
              Clear all
            </button>
          </div>
          {busy && <Spinner text={busy} />}
          {error && <Notice tone="bad">{error}</Notice>}
          {!job && <p className="mt-2 text-sm text-ink-2">Choose Review next to a file to see and correct its tables.</p>}
        </Bench>
      )}

      {job && res && (
        <Bench>
          <p className="label">
            {job.file.name} · {res.read.tables.length} {res.read.tables.length === 1 ? 'table' : 'tables'} · {res.read.blocks.length} {res.read.blocks.length === 1 ? 'paragraph' : 'paragraphs'} outside tables{scripts.length ? ` · scripts: ${scripts.join(', ')}` : ''}
          </p>
          {res.read.tables.length === 0 && <Notice tone="warn">This document has no tables. Tick “Headings, paragraphs and lists” to put its text in Excel.</Notice>}
          {res.read.tables.length > 0 && (
            <div className="mt-3">
              <TableEditor items={res.items} onChange={(items) => q.update(job.id, { ...res, items })} nextId={() => `t${++ids.current}`} />
            </div>
          )}
          {res.read.blocks.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm underline">Text outside tables ({res.read.blocks.length})</summary>
              <div className="mt-2 max-h-72 overflow-y-auto border border-rule p-2 text-[0.88rem]" dir="auto">
                {res.read.blocks.slice(0, 300).map((b, i) => (
                  <p key={i} dir="auto" className={b.kind === 'heading' ? 'mt-2 font-semibold' : b.kind === 'list' ? 'pl-4' : 'mt-1'}>
                    {b.kind === 'list' ? (b.list === 'bullet' ? '• ' : '– ') : ''}
                    {b.text}
                  </p>
                ))}
              </div>
            </details>
          )}
        </Bench>
      )}
    </div>
  );
}
