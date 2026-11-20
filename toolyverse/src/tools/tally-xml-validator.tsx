'use client';

import { useMemo, useState } from 'react';
import { readTally, type TallyRead } from '@/lib/tally/read';
import { checkStructure, validate, type CheckOptions, type Issue } from '@/lib/tally/validate';
import type { XNode } from '@/lib/tally/xml';
import { XLSX_TYPE } from '@/lib/gst/excel';
import { Bench, FileDrop, Notice, Spinner, baseName, download, formatSize, type ToolProps } from './kit';
import { IssueList, LedgerMasters, ReferencePanel, SectionTitle, SummaryGrid, VoucherTable, readUpload, type Reference } from './tally/shared';

interface Loaded {
  name: string;
  size: number;
  root: XNode | null;
  syntax: Issue[];
  read: TallyRead | null;
}

export default function TallyXmlValidator(props: ToolProps) {
  const [ref, setRef] = useState<Reference | null>(null);
  const [file, setFile] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);

  const open = async (f: File) => {
    setError(null);
    setBusy('Reading the XML…');
    try {
      const up = await readUpload(f, ['xml']);
      if (up.kind !== 'xml') return;
      const syntax: Issue[] = up.parsed.problems.map((p) => ({ level: /DOCTYPE/.test(p.message) ? 'warning' : 'error', voucher: -1, at: p.line, message: `XML syntax: ${p.message}` }));
      setFile({ name: up.name, size: f.size, root: up.parsed.root, syntax, read: up.parsed.root ? readTally(up.parsed.root) : null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const result = useMemo(() => {
    if (!file) return null;
    const vouchers = file.read?.vouchers ?? [];
    const structure = file.root && file.read ? checkStructure(file.root, file.read.voucherNodes) : [];
    const v = validate(vouchers, (ref?.opts ?? {}) as CheckOptions);
    const unsupported: Issue[] = (file.read?.unsupported ?? []).map((u) => ({ level: 'warning', voucher: -1, message: `Not checked by this validator: <${u.path.split('/').pop()}> in ${u.path} (${u.count}×). Tally may still accept it.` }));
    const empty: Issue[] = file.root && file.read && !vouchers.length && !file.read.masters.length ? [{ level: 'warning', voucher: -1, message: 'No vouchers or masters were found in this file.' }] : [];
    const issues = [...file.syntax, ...structure, ...v.issues.filter((x) => !(x.voucher === -1 && /no vouchers to check/.test(x.message) && file.read?.masters.length)), ...unsupported, ...empty];
    const bad = new Set([...v.bad, ...structure.filter((x) => x.level === 'error' && x.voucher >= 0).map((x) => x.voucher)]);
    return { vouchers, issues, bad, summary: { ...v.summary, errors: issues.filter((x) => x.level === 'error').length, warnings: issues.filter((x) => x.level === 'warning').length, valid: vouchers.length - bad.size, invalid: bad.size } };
  }, [file, ref]);

  if (!file || !result)
    return (
      <>
        <FileDrop accept=".xml,text/xml,application/xml" onFiles={(f) => void open(f[0])} props={props} label="Choose a Tally XML file" hint="import files or exports from Tally" />
        {busy && <Spinner text={busy} />}
        {error && <Notice tone="bad">{error}</Notice>}
      </>
    );

  const errors = result.summary.errors;
  return (
    <Bench>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label">
          {file.name} · {formatSize(file.size)}
          {file.read ? ` · ${file.read.kind}` : ''}
        </p>
        <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={() => setFile(null)}>
          Another file
        </button>
      </div>
      <Notice tone={errors ? 'bad' : result.summary.warnings ? 'warn' : 'ok'}>
        {errors ? `${errors} error${errors === 1 ? '' : 's'}: Tally is likely to refuse ${result.bad.size ? `${result.bad.size} voucher${result.bad.size === 1 ? '' : 's'}` : 'the file'}.` : result.summary.warnings ? `No errors; ${result.summary.warnings} warning${result.summary.warnings === 1 ? '' : 's'} worth a look.` : 'No problems found.'}
        {!ref ? ' Add an export from your Tally (below) to also check ledger names and duplicates.' : ' Checked against the ledgers and vouchers in your Tally export.'}
      </Notice>
      <div className="mt-3">
        <SummaryGrid s={result.summary} />
      </div>
      <SectionTitle n={1}>Problems by line and voucher</SectionTitle>
      <IssueList issues={result.issues} vouchers={result.vouchers} atLabel="Line" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            const { reportWorkbook } = await import('@/lib/tally/sheet');
            download(await reportWorkbook(result.vouchers, result.issues, result.summary, result.bad), `${baseName(file.name)}-validation.xlsx`, XLSX_TYPE);
          }}
        >
          Download validation report (Excel)
        </button>
      </div>

      {result.vouchers.length > 0 && (
        <>
          <SectionTitle n={2}>Vouchers</SectionTitle>
          <VoucherTable vouchers={result.vouchers} bad={result.bad} />
        </>
      )}

      <SectionTitle n={3}>Compare with your Tally data</SectionTitle>
      <p className="mt-1 text-sm text-ink-2">Finds ledgers and voucher types that do not exist in the company and vouchers already entered, using an XML export from your Tally. Nothing connects to Tally.</p>
      <ReferencePanel value={ref} onChange={setRef} />
      {ref?.opts.ledgers && <LedgerMasters vouchers={result.vouchers} known={ref.opts.ledgers} company={file.read?.company ?? ''} />}
    </Bench>
  );
}
