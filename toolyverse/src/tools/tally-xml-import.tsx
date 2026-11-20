'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { isTallyXml, readTally } from '@/lib/tally/read';
import { checkStructure, validate, type Issue } from '@/lib/tally/validate';
import { cleanVoucherXml } from '@/lib/tally/convert';
import { importEnvelope, voucherXml } from '@/lib/tally/build';
import type { Voucher } from '@/lib/tally/model';
import type { XNode } from '@/lib/tally/xml';
import { XLSX_TYPE } from '@/lib/gst/excel';
import { Bench, FileDrop, Notice, Spinner, baseName, download, formatSize, type ToolProps } from './kit';
import { ImportSteps, IssueList, LedgerMasters, ProfileOptions, ReferencePanel, SectionTitle, SummaryGrid, VoucherTable, XML_TYPE, readUpload, useProfile, type Reference } from './tally/shared';

interface Loaded {
  name: string;
  size: number;
  vouchers: Voucher[];
  /** The original VOUCHER elements, when the file was Tally XML. */
  nodes: XNode[] | null;
  fileIssues: Issue[];
  company: string;
}

export default function TallyXmlImport(props: ToolProps) {
  const sheetFirst = props.preset?.accept === 'excel';
  const prof = useProfile();
  const [ref, setRef] = useState<Reference | null>(null);
  const [file, setFile] = useState<Loaded | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);

  const open = async (f: File) => {
    setError(null);
    setBusy('Reading the file…');
    try {
      const up = await readUpload(f, ['xml', 'sheet']);
      let loaded: Loaded;
      if (up.kind === 'xml') {
        const root = up.parsed.root;
        const syntax: Issue[] = up.parsed.problems.map((p) => ({ level: /DOCTYPE/.test(p.message) ? 'warning' : 'error', voucher: -1, at: p.line, message: `XML syntax: ${p.message}` }));
        if (!root) throw new Error(`This XML cannot be read: ${up.parsed.problems.slice(0, 3).map((p) => `line ${p.line}: ${p.message}`).join(' ')}`);
        if (!isTallyXml(root)) throw new Error('This XML is not Tally XML. Convert it first with the XML to Tally Converter.');
        const read = readTally(root);
        if (!read.vouchers.length) throw new Error(read.masters.length ? 'This file holds masters only. Import it in Tally with Import → Masters, or change it with the Tally XML Converter.' : 'No vouchers were found in this file.');
        loaded = { name: up.name, size: f.size, vouchers: read.vouchers, nodes: read.voucherNodes, fileIssues: [...syntax, ...checkStructure(root, read.voucherNodes).filter((x) => x.voucher === -1 && !/HEADER|TALLYREQUEST|IMPORTDATA/.test(x.message))], company: read.company };
      } else {
        const { detectColumns, rowsToVouchers } = await import('@/lib/tally/sheet');
        const hit = up.sheets.map((s) => ({ s, d: detectColumns(s.rows) })).find((x) => x.d.headerRow >= 0 && (x.d.mapping.debit >= 0 || x.d.mapping.credit >= 0 || x.d.mapping.amount >= 0));
        if (!hit) throw new Error('No sheet has the template columns (Ledger Name with Debit/Credit). Use the template, or the Excel to Tally XML Converter to match other columns.');
        const r = rowsToVouchers(hit.s.rows, hit.d.mapping, { headerRow: hit.d.headerRow, defaultType: 'Journal' });
        loaded = { name: up.name, size: f.size, vouchers: r.vouchers, nodes: null, fileIssues: r.problems.map((p) => ({ level: 'error', voucher: -1, at: p.row, message: p.message })), company: '' };
      }
      setFile(loaded);
      if (loaded.company) prof.setCompany(loaded.company);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const check = useMemo(() => {
    if (!file) return null;
    const r = validate(file.vouchers, { ...ref?.opts, company: prof.profile.company });
    const issues = [...file.fileIssues, ...r.issues];
    return { ...r, issues, summary: { ...r.summary, errors: issues.filter((x) => x.level === 'error').length } };
  }, [file, ref, prof.profile.company]);

  // Valid vouchers start ticked whenever the checks change.
  const [tickedFor, setTickedFor] = useState<unknown>(null);
  if (check && tickedFor !== check) {
    setTickedFor(check);
    setSelected(new Set(file!.vouchers.map((_, i) => i).filter((i) => !check.bad.has(i))));
  }

  if (!file || !check)
    return (
      <>
        <FileDrop
          accept=".xml,.xlsx,.xls,.csv,text/xml,application/xml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          onFiles={(f) => void open(f[0])}
          props={props}
          label={sheetFirst ? 'Choose an Excel or XML file' : 'Choose a Tally XML file'}
          hint={sheetFirst ? 'template Excel, CSV or Tally XML' : 'or the voucher Excel template'}
        />
        {busy && <Spinner text={busy} />}
        {error && <Notice tone="bad">{error}</Notice>}
      </>
    );

  const chosen = [...selected].sort((a, b) => a - b).filter((i) => !check.bad.has(i));
  const itemXml = (i: number) => (file.nodes ? cleanVoucherXml(file.nodes[i]) : voucherXml(file.vouchers[i], prof.profile));
  const name = baseName(file.name);
  const dupes = check.issues.filter((x) => /already in Tally/.test(x.message)).length;

  return (
    <Bench>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label">
          {file.name} · {formatSize(file.size)} · {file.vouchers.length} vouchers{file.company ? ` · made for ${file.company}` : ''}
        </p>
        <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={() => setFile(null)}>
          Another file
        </button>
      </div>

      <SectionTitle n={1}>Check</SectionTitle>
      <ReferencePanel value={ref} onChange={setRef} />
      <div className="mt-3">
        <SummaryGrid s={check.summary} />
      </div>
      {dupes > 0 && <Notice tone="warn">{dupes} voucher{dupes === 1 ? ' is' : 's are'} already in your Tally export (same type, number and date) and left out, so nothing is entered twice.</Notice>}
      <IssueList issues={check.issues} vouchers={file.vouchers} atLabel={file.nodes ? 'Line' : 'Row'} />
      {ref?.opts.ledgers && <LedgerMasters vouchers={file.vouchers} known={ref.opts.ledgers} company={prof.profile.company} />}

      <SectionTitle n={2}>Choose vouchers</SectionTitle>
      <VoucherTable vouchers={file.vouchers} bad={check.bad} selected={selected} onSelect={(s) => setSelected(new Set([...s].filter((i) => !check.bad.has(i))))} />
      {check.bad.size > 0 && <p className="mt-1 text-[0.8rem] text-ink-3">Vouchers with errors (shaded) cannot be ticked. Fix them in the source file, or download the error report.</p>}

      <SectionTitle n={3}>Download for import</SectionTitle>
      <div className="mt-3">
        <ProfileOptions p={prof} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={!chosen.length} onClick={() => download(new TextEncoder().encode(importEnvelope('Vouchers', chosen.map(itemXml), prof.profile.company)), `${name}-for-tally.xml`, XML_TYPE)}>
          Download import XML ({chosen.length})
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            const { reportWorkbook } = await import('@/lib/tally/sheet');
            download(await reportWorkbook(file.vouchers, check.issues, check.summary, check.bad), `${name}-import-check.xlsx`, XLSX_TYPE);
          }}
        >
          Download error report
        </button>
      </div>
      <p className="mt-2 text-[0.8rem] text-ink-3">
        The file holds only the ticked, error-free vouchers{file.nodes ? ", each exactly as in your file but without Tally's internal IDs, so they import as new entries" : ''}. Need different ledger names or another company? Use the{' '}
        <Link className="underline" href="/tally-xml-converter">
          Tally XML Converter
        </Link>
        .
      </p>
      {!ref && <LedgerMasters vouchers={chosen.map((i) => file.vouchers[i])} company={prof.profile.company} />}
      <ImportSteps />
      <p className="mt-2 text-[0.8rem] text-ink-3">After importing, Tally reports how many vouchers it created. If some were refused, its Tally.imp log names the voucher and the reason (most often a ledger that does not exist).</p>
    </Bench>
  );
}
