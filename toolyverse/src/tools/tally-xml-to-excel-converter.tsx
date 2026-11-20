'use client';

import { useState } from 'react';
import { readTally, type TallyRead } from '@/lib/tally/read';
import { validate } from '@/lib/tally/validate';
import { XLSX_TYPE } from '@/lib/gst/excel';
import { Bench, FileDrop, Notice, Spinner, baseName, download, formatSize, type ToolProps } from './kit';
import { PreviewTable, SectionTitle, SummaryGrid, VoucherTable, readUpload } from './tally/shared';

interface Done {
  name: string;
  size: number;
  read: TallyRead;
  problems: string[];
}

export default function TallyXmlToExcel(props: ToolProps) {
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<string[] | null>(null);

  const open = async (file: File) => {
    setError(null);
    setSheets(null);
    setBusy('Reading the XML…');
    try {
      const up = await readUpload(file, ['xml']);
      if (up.kind !== 'xml') return;
      if (!up.parsed.root) throw new Error(`This XML cannot be read: ${up.parsed.problems.map((p) => `line ${p.line}: ${p.message}`).slice(0, 3).join(' ')}`);
      const read = readTally(up.parsed.root);
      setDone({ name: up.name, size: file.size, read, problems: up.parsed.problems.map((p) => `Line ${p.line}: ${p.message}`) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (!done)
    return (
      <>
        <FileDrop accept=".xml,text/xml,application/xml" onFiles={(f) => void open(f[0])} props={props} label="Choose a Tally XML file" hint="Day Book, vouchers, ledgers or reports exported from Tally" />
        {busy && <Spinner text={busy} />}
        {error && <Notice tone="bad">{error}</Notice>}
      </>
    );

  const { read } = done;
  const check = read.vouchers.length ? validate(read.vouchers) : null;
  const save = async () => {
    setBusy('Writing the Excel file…');
    try {
      const { tallyReadWorkbook } = await import('@/lib/tally/sheet');
      const out = await tallyReadWorkbook(read);
      setSheets(out.sheets);
      download(out.bytes, `${baseName(done.name)}.xlsx`, XLSX_TYPE);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <Bench>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label">
          {done.name} · {formatSize(done.size)} · {read.kind}
          {read.company ? ` · ${read.company}` : ''}
        </p>
        <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={() => setDone(null)}>
          Another file
        </button>
      </div>
      {done.problems.length > 0 && (
        <Notice tone="warn">
          The XML has {done.problems.length} structural problem{done.problems.length === 1 ? '' : 's'}; everything readable was kept. {done.problems.slice(0, 3).join(' ')}
        </Notice>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={!!busy} onClick={() => void save()}>
          Download Excel
        </button>
      </div>
      {busy && <Spinner text={busy} />}
      {error && <Notice tone="bad">{error}</Notice>}
      {sheets && <Notice tone="ok">Saved with sheets: {sheets.join(', ')}.</Notice>}

      {check && (
        <>
          <SectionTitle n={1}>Vouchers</SectionTitle>
          <div className="mt-3">
            <SummaryGrid s={check.summary} />
          </div>
          {check.bad.size > 0 && <Notice tone="warn">{check.bad.size} voucher{check.bad.size === 1 ? ' does' : 's do'} not balance or miss details; they are converted exactly as they are in the file.</Notice>}
          <VoucherTable vouchers={read.vouchers} bad={check.bad} />
        </>
      )}
      {read.masters.map((m) => (
        <div key={m.kind}>
          <SectionTitle>
            {m.rows.length} {m.kind.toLowerCase()} master{m.rows.length === 1 ? '' : 's'}
          </SectionTitle>
          <PreviewTable rows={m.rows} />
        </div>
      ))}
      {read.report && read.report.rows.length > 0 && (
        <>
          <SectionTitle>Report rows</SectionTitle>
          <PreviewTable rows={read.report.rows} />
        </>
      )}
      {read.unsupported.length > 0 && (
        <>
          <SectionTitle>Kept in a separate sheet</SectionTitle>
          <p className="mt-1 text-sm text-ink-2">These parts of the XML have no column of their own. They are listed on the &ldquo;Not converted&rdquo; sheet so nothing goes missing without notice; single values are on &ldquo;Other fields&rdquo;.</p>
          <ul className="mt-2 divide-y divide-rule border border-rule text-sm">
            {read.unsupported.map((u) => (
              <li key={u.path} className="grid grid-cols-[1fr_4rem] gap-2 px-3 py-1.5">
                <span className="font-mono">{u.path}</span>
                <span className="text-right">{u.count}×</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {!read.vouchers.length && !read.masters.length && !read.report?.rows.length && <Notice tone="warn">The file has no vouchers, masters or report rows to convert.</Notice>}
    </Bench>
  );
}

