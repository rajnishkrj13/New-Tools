'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { zipStore } from '@editor/engines/PdfTools';
import { FIELDS, detectColumns, emptyMapping, rowsToVouchers, type FieldKey, type Mapping } from '@/lib/tally/sheet';
import { isTallyXml, xmlToTable } from '@/lib/tally/read';
import { VOUCHER_TYPES } from '@/lib/tally/model';
import { vouchersXml, vouchersXmlByType } from '@/lib/tally/build';
import { validate, type Issue } from '@/lib/tally/validate';
import { XLSX_TYPE } from '@/lib/gst/excel';
import { Bench, FileDrop, Notice, Segmented, Spinner, baseName, download, type ToolProps } from './kit';
import { ImportSteps, IssueList, LedgerMasters, ProfileOptions, ReferencePanel, SectionTitle, SummaryGrid, VoucherTable, XML_TYPE, XmlPreview, readUpload, useProfile, type Reference } from './tally/shared';

interface Source {
  name: string;
  sheets: { name: string; rows: unknown[][] }[];
  /** Read from non-Tally XML: the repeating element used as rows. */
  xmlRecord?: string;
}

const cellText = (v: unknown) => (v instanceof Date ? v.toLocaleDateString('en-GB') : String(v ?? ''));

export default function ExcelToTallyXml(props: ToolProps) {
  const fromXml = props.preset?.source === 'xml';
  const prof = useProfile();
  const [ref, setRef] = useState<Reference | null>(null);
  const [src, setSrc] = useState<Source | null>(null);
  const [sheet, setSheet] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Mapping>(emptyMapping());
  const [defaultType, setDefaultType] = useState(props.preset?.type ?? 'Journal');
  const [split, setSplit] = useState<'one' | 'type' | 'voucher'>('one');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tallyXml, setTallyXml] = useState(false);

  const choose = (s: Source, index: number) => {
    const rows = s.sheets[index]?.rows ?? [];
    const d = detectColumns(rows);
    setSheet(index);
    setHeaderRow(Math.max(0, d.headerRow));
    setMapping(d.headerRow >= 0 ? d.mapping : emptyMapping());
  };

  const open = async (file: File) => {
    setError(null);
    setTallyXml(false);
    setBusy('Reading the file…');
    try {
      const up = await readUpload(file, ['sheet', 'xml']);
      let s: Source;
      if (up.kind === 'xml') {
        if (!up.parsed.root) throw new Error(`The XML could not be read: ${up.parsed.problems[0]?.message ?? 'unknown problem'}`);
        if (isTallyXml(up.parsed.root)) {
          setTallyXml(true);
          return;
        }
        const t = xmlToTable(up.parsed.root);
        if (!t.rows.length) throw new Error('No repeating records were found in this XML.');
        s = { name: up.name, xmlRecord: t.record, sheets: [{ name: t.record, rows: [t.columns, ...t.rows.map((r) => t.columns.map((c) => r[c] ?? ''))] }] };
      } else s = { name: up.name, sheets: up.sheets };
      setSrc(s);
      const best = Math.max(0, s.sheets.findIndex((x) => detectColumns(x.rows).headerRow >= 0));
      choose(s, best);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const rows = useMemo(() => src?.sheets[sheet]?.rows ?? [], [src, sheet]);
  const converted = useMemo(() => {
    if (!src || mapping.ledger < 0) return null;
    const r = rowsToVouchers(rows, mapping, { headerRow, defaultType });
    const check = validate(r.vouchers, { ...ref?.opts, company: prof.profile.company });
    const rowIssues: Issue[] = r.problems.map((p) => ({ level: 'error', voucher: -1, at: p.row, message: p.message }));
    return { ...r, check, issues: [...rowIssues, ...check.issues] };
  }, [src, rows, mapping, headerRow, defaultType, prof.profile.company, ref]);

  if (tallyXml)
    return (
      <Bench>
        <Notice tone="info">
          This is already Tally XML. To check it use the <Link className="underline" href="/tally-xml-validator">Tally XML Validator</Link>, to read it in Excel the{' '}
          <Link className="underline" href="/tally-xml-to-excel-converter">Tally XML to Excel Converter</Link>, and to change it for another company or Tally version the{' '}
          <Link className="underline" href="/tally-xml-converter">Tally XML Converter</Link>.
        </Notice>
        <button type="button" className="btn btn-ghost mt-3" onClick={() => setTallyXml(false)}>
          Choose another file
        </button>
      </Bench>
    );

  if (!src)
    return (
      <>
        <FileDrop
          accept={fromXml ? '.xml,text/xml,application/xml' : '.xlsx,.xls,.csv,.xml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/xml'}
          onFiles={(f) => void open(f[0])}
          props={props}
          label={fromXml ? 'Choose an XML file' : 'Choose an Excel or CSV file'}
          hint={fromXml ? 'any XML with one record per entry' : 'XLSX, XLS, CSV, or XML from other software'}
        />
        {busy && <Spinner text={busy} />}
        {error && <Notice tone="bad">{error}</Notice>}
        <p className="mt-3 text-sm text-ink-2">
          No file yet?{' '}
          <button
            type="button"
            className="underline"
            onClick={async () => {
              const { templateWorkbook } = await import('@/lib/tally/sheet');
              download(await templateWorkbook(), 'tally-journal-template.xlsx', XLSX_TYPE);
            }}
          >
            Download the Excel template
          </button>{' '}
          or type vouchers in the <Link className="underline" href="/tally-journal-entry-excel">Excel Journal Entry Creator</Link>.
        </p>
      </>
    );

  const header = (rows[headerRow] ?? []) as unknown[];
  const colOptions = header.map((h, i) => ({ i, label: `${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}: ${cellText(h) || '(blank)'}` }));
  const sample = rows.slice(headerRow + 1, headerRow + 4);
  const v = converted?.vouchers ?? [];
  const bad = converted?.check.bad ?? new Set<number>();
  const valid = v.filter((_, i) => !bad.has(i));
  const rowErrors = (converted?.problems.length ?? 0) > 0;
  const name = baseName(src.name);

  const save = () => {
    if (split === 'one') return download(new TextEncoder().encode(vouchersXml(valid, prof.profile)), `${name}-tally.xml`, XML_TYPE);
    const files =
      split === 'type'
        ? vouchersXmlByType(valid, prof.profile).map((f) => ({ name: `${name}-${f.type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xml`, bytes: new TextEncoder().encode(f.xml) }))
        : valid.map((x, i) => ({ name: `${String(i + 1).padStart(4, '0')}-${(x.number || x.type).replace(/[^\w-]+/g, '_')}.xml`, bytes: new TextEncoder().encode(vouchersXml([x], prof.profile)) }));
    download(zipStore(files), `${name}-tally-xml.zip`, 'application/zip');
  };

  return (
    <Bench>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label">
          {src.name}
          {src.xmlRecord ? ` · ${rows.length - 1} <${src.xmlRecord}> records` : ` · ${src.sheets.length} sheet${src.sheets.length === 1 ? '' : 's'}`}
        </p>
        <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={() => setSrc(null)}>
          Another file
        </button>
      </div>

      <SectionTitle n={1}>Columns</SectionTitle>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {src.sheets.length > 1 && (
          <label className="block">
            <span className="label mb-1 block">Worksheet</span>
            <select className="field" value={sheet} onChange={(e) => choose(src, Number(e.target.value))}>
              {src.sheets.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name} ({s.rows.length} rows)
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="label mb-1 block">Header row</span>
          <input type="number" min={1} max={Math.max(1, rows.length)} className="field" value={headerRow + 1} onChange={(e) => setHeaderRow(Math.max(0, Number(e.target.value) - 1))} />
        </label>
        <label className="block">
          <span className="label mb-1 block">Voucher type when not given</span>
          <input className="field" list="excel-vtypes" value={defaultType} onChange={(e) => setDefaultType(e.target.value)} />
          <datalist id="excel-vtypes">
            {VOUCHER_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="grid grid-cols-[9.5rem_1fr] items-center gap-2 text-sm">
            <span className={f.key === 'ledger' ? 'font-semibold' : ''}>{f.label}</span>
            <select className="field !min-h-9 py-1 text-sm" value={mapping[f.key]} onChange={(e) => setMapping({ ...mapping, [f.key as FieldKey]: Number(e.target.value) })}>
              <option value={-1}>— not in this file —</option>
              {colOptions.map((c) => (
                <option key={c.i} value={c.i}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="mt-2 text-[0.8rem] text-ink-3">Use Debit and Credit columns, or one Amount column with a Dr/Cr column (without it, minus amounts are credits). Rows without a voucher number are grouped until debits equal credits.</p>
      {sample.length > 0 && (
        <div className="mt-3 overflow-x-auto border border-rule">
          <table className="w-full border-collapse text-[0.8rem]">
            <thead className="bg-paper-2">
              <tr>
                {header.map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-2 py-1 text-left">
                    {cellText(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sample.map((r, k) => (
                <tr key={k} className="border-t border-rule">
                  {header.map((_, i) => (
                    <td key={i} className="max-w-[14rem] truncate whitespace-nowrap px-2 py-1">
                      {cellText((r as unknown[])[i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mapping.ledger < 0 && <Notice tone="warn">Choose which column holds the ledger names.</Notice>}
      {mapping.ledger >= 0 && mapping.debit < 0 && mapping.credit < 0 && mapping.amount < 0 && <Notice tone="warn">Choose the Debit and Credit columns, or an Amount column.</Notice>}

      {converted && (
        <>
          <SectionTitle n={2}>Check and preview</SectionTitle>
          <ReferencePanel value={ref} onChange={setRef} />
          <div className="mt-3">
            <SummaryGrid s={converted.check.summary} />
          </div>
          <IssueList issues={converted.issues} vouchers={v} atLabel="Voucher starts at row" />
          <VoucherTable vouchers={v} bad={bad} />

          <SectionTitle n={3}>Tally XML</SectionTitle>
          <div className="mt-3">
            <ProfileOptions p={prof} />
          </div>
          <div className="mt-4">
            <Segmented
              label="Files"
              value={split}
              onChange={setSplit}
              options={[
                { value: 'one', label: 'One XML file' },
                { value: 'type', label: 'One per voucher type' },
                { value: 'voucher', label: 'One per voucher' },
              ]}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={!valid.length} onClick={save}>
              Download XML ({valid.length} voucher{valid.length === 1 ? '' : 's'})
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!v.length}
              onClick={async () => {
                const { vouchersWorkbook } = await import('@/lib/tally/sheet');
                download(await vouchersWorkbook(v, { issues: converted.issues, bad }), `${name}-checked.xlsx`, XLSX_TYPE);
              }}
            >
              Excel with checks
            </button>
          </div>
          {bad.size > 0 && <Notice tone="warn">{bad.size} voucher{bad.size === 1 ? '' : 's'} with errors {bad.size === 1 ? 'is' : 'are'} left out of the XML. Fix them in the file and upload it again, or download the Excel with checks.</Notice>}
          {rowErrors && <Notice tone="warn">Some cells could not be read (see the problems above); the vouchers they belong to may be incomplete.</Notice>}
          {valid.length > 0 && <XmlPreview xml={vouchersXml(valid.slice(0, 20), prof.profile)} />}

          <LedgerMasters vouchers={valid} known={ref?.opts.ledgers} company={prof.profile.company} />
          <ImportSteps />
        </>
      )}
    </Bench>
  );
}
