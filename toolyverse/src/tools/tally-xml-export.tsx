'use client';

import { useMemo, useState } from 'react';
import { readTally, type TallyRead } from '@/lib/tally/read';
import { cleanVoucherXml } from '@/lib/tally/convert';
import { importEnvelope } from '@/lib/tally/build';
import { VOUCHER_TYPES, baseType } from '@/lib/tally/model';
import { writeXml, type XNode } from '@/lib/tally/xml';
import { XLSX_TYPE } from '@/lib/gst/excel';
import { Bench, FileDrop, Notice, Spinner, baseName, download, formatSize, type ToolProps } from './kit';
import { PreviewTable, SectionTitle, VoucherTable, XML_TYPE, XmlPreview, readUpload } from './tally/shared';

const fyStart = (d = new Date()) => (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1);

/** Where to find each kind of data in Tally's own export. */
const HOW: [string, string, string][] = [
  ['All vouchers', 'Display More Reports → Day Book → F2 to set the period → Alt+E (Export) → Format: XML (Data Interchange)', 'Gateway → Display → Day Book → Alt+E → Format: XML'],
  ['One voucher type', 'Day Book → Ctrl+F4 or Alt+F12 to filter by type, or Display More Reports → Account Books → (type) Register → Alt+E → XML', 'Display → Account Books → (type) Register → Alt+E'],
  ['Vouchers of one ledger', 'Display More Reports → Account Books → Ledger → choose the ledger → Alt+E → XML', 'Display → Account Books → Ledger → Alt+E'],
  ['Ledger and group masters', 'Display More Reports → List of Accounts → Alt+E → XML (Data Interchange)', 'Display → List of Accounts → Alt+E'],
  ['Stock items, cost centres', 'List of Accounts → Ctrl+H (change view) → Stock Items / Cost Centres → Alt+E → XML', 'List of Accounts → F4 (Inventory masters) → Alt+E'],
  ['Trial Balance, Balance Sheet, P&L', 'Open the report → Alt+E → Format: XML', 'Open the report → Alt+E → Format: XML'],
  ['Outstanding bills', 'Display More Reports → Statements of Accounts → Outstandings → Receivables / Payables → Alt+E → XML', 'Display → Statements of Accounts → Outstandings → Alt+E'],
];

interface Loaded {
  name: string;
  size: number;
  read: TallyRead;
  root: XNode;
}

export default function TallyXmlExport(props: ToolProps) {
  const start = fyStart();
  const [file, setFile] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [number, setNumber] = useState('');
  const [ledger, setLedger] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [strip, setStrip] = useState(false);

  const open = async (f: File) => {
    setError(null);
    setBusy('Reading the export…');
    try {
      const up = await readUpload(f, ['xml']);
      if (up.kind !== 'xml') return;
      if (!up.parsed.root) throw new Error(`This XML cannot be read: ${up.parsed.problems.slice(0, 3).map((p) => `line ${p.line}: ${p.message}`).join(' ')}`);
      const read = readTally(up.parsed.root);
      setFile({ name: up.name, size: f.size, read, root: up.parsed.root });
      setSelected(new Set(read.vouchers.map((_, i) => i)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const keep = useMemo(() => {
    if (!file) return [];
    const l = ledger.trim().toLowerCase();
    return file.read.vouchers
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => {
        if (type.startsWith('=') ? v.type !== type.slice(1) : type !== 'all' && baseType(v.type) !== type) return false;
        if (from && v.date < from) return false;
        if (to && v.date > to) return false;
        if (number.trim() && !v.number.toLowerCase().includes(number.trim().toLowerCase())) return false;
        if (l && !v.entries.some((e) => e.ledger.toLowerCase() === l)) return false;
        return true;
      })
      .map(({ i }) => i);
  }, [file, type, from, to, number, ledger]);

  const typesInFile = useMemo(() => [...new Set(file?.read.vouchers.map((v) => v.type) ?? [])].sort(), [file]);
  const ledgersInFile = useMemo(() => [...new Set(file?.read.vouchers.flatMap((v) => v.entries.map((e) => e.ledger)) ?? [])].filter(Boolean).sort(), [file]);
  const picked = keep.filter((i) => selected.has(i));
  const outXml = useMemo(() => {
    if (!file) return '';
    if (!file.read.vouchers.length) return writeXml(file.root);
    return importEnvelope('Vouchers', picked.map((i) => (strip ? cleanVoucherXml(file.read.voucherNodes[i]) : writeXml(file.read.voucherNodes[i], '     '))), file.read.company);
  }, [file, picked, strip]);

  const howTo = (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[0.86rem]">
        <thead className="bg-paper-2 text-left">
          <tr>
            <th className="px-2 py-1.5">To export</th>
            <th className="px-2">TallyPrime</th>
            <th className="px-2">Tally.ERP 9</th>
          </tr>
        </thead>
        <tbody>
          {HOW.map(([what, prime, erp]) => (
            <tr key={what} className="border-t border-rule align-top">
              <td className="px-2 py-1.5 font-semibold">{what}</td>
              <td className="px-2 py-1.5">{prime}</td>
              <td className="px-2 py-1.5 text-ink-2">{erp}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!file)
    return (
      <Bench>
        <SectionTitle n={1}>Export the XML from Tally</SectionTitle>
        <p className="mt-1 text-sm text-ink-2">Tally writes the XML file itself. In the export screen choose Format: XML (Data Interchange), and note the folder it saves to.</p>
        <div className="mt-3">{howTo}</div>
        <SectionTitle n={2}>Open it here to filter, pick and convert</SectionTitle>
        <div className="mt-3">
          <FileDrop accept=".xml,text/xml,application/xml" onFiles={(f) => void open(f[0])} props={props} label="Choose the exported XML" hint="Day Book, registers, ledgers, masters or reports" />
        </div>
        {busy && <Spinner text={busy} />}
        {error && <Notice tone="bad">{error}</Notice>}
      </Bench>
    );

  const name = baseName(file.name);
  const fys = [0, 1, 2, 3].map((k) => start - k);

  return (
    <Bench>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label">
          {file.name} · {formatSize(file.size)} · {file.read.kind}
          {file.read.company ? ` · ${file.read.company}` : ''}
        </p>
        <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={() => setFile(null)}>
          Another file
        </button>
      </div>

      {file.read.vouchers.length > 0 && (
        <>
          <SectionTitle n={1}>Filter</SectionTitle>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="label mb-1 block">Voucher type</span>
              <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="all">All types</option>
                <optgroup label="By built-in type">
                  {VOUCHER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t} (and its custom types)
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Exact names in this file">
                  {typesInFile.map((t) => (
                    <option key={t} value={`=${t}`}>
                      {t}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="block">
              <span className="label mb-1 block">Financial year</span>
              <select
                className="field"
                value=""
                onChange={(e) => {
                  const y = Number(e.target.value);
                  if (y) {
                    setFrom(`${y}-04-01`);
                    setTo(`${y + 1}-03-31`);
                  }
                }}
              >
                <option value="">Choose to fill the dates</option>
                {fys.map((y) => (
                  <option key={y} value={y}>
                    {y}-{String((y + 1) % 100).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label mb-1 block">From</span>
                <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="block">
                <span className="label mb-1 block">To</span>
                <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label mb-1 block">Number has</span>
                <input className="field" value={number} onChange={(e) => setNumber(e.target.value)} />
              </label>
              <label className="block">
                <span className="label mb-1 block">Ledger</span>
                <input className="field" list="export-ledgers" value={ledger} onChange={(e) => setLedger(e.target.value)} />
                <datalist id="export-ledgers">
                  {ledgersInFile.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </label>
            </div>
          </div>
          <p className="mt-2 label">
            {keep.length} of {file.read.vouchers.length} vouchers match · {picked.length} ticked
          </p>
          <SectionTitle n={2}>Vouchers</SectionTitle>
          <VoucherTable vouchers={keep.map((i) => file.read.vouchers[i])} selected={new Set(keep.map((i, k) => (selected.has(i) ? k : -1)).filter((k) => k >= 0))} onSelect={(s) => setSelected(new Set([...selected].filter((i) => !keep.includes(i)).concat([...s].map((k) => keep[k]))))} />
          <label className="mt-3 flex items-start gap-2 text-[0.92rem]">
            <input type="checkbox" className="mt-1" checked={strip} onChange={(e) => setStrip(e.target.checked)} />
            <span>Prepare for importing into another company (removes Tally&apos;s internal IDs and empty tags)</span>
          </label>
        </>
      )}
      {file.read.masters.map((m) => (
        <div key={m.kind}>
          <p className="mt-4 font-semibold">
            {m.rows.length} {m.kind.toLowerCase()} records
          </p>
          <PreviewTable rows={m.rows} />
        </div>
      ))}
      {file.read.report && file.read.report.rows.length > 0 && <PreviewTable rows={file.read.report.rows} />}

      <SectionTitle n={3}>Download</SectionTitle>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={file.read.vouchers.length > 0 && !picked.length} onClick={() => download(new TextEncoder().encode(outXml), `${name}${file.read.vouchers.length ? `-${picked.length}-vouchers` : ''}.xml`, XML_TYPE)}>
          Download XML{file.read.vouchers.length ? ` (${picked.length})` : ''}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            const { tallyReadWorkbook } = await import('@/lib/tally/sheet');
            const read = file.read.vouchers.length ? { ...file.read, vouchers: picked.map((i) => file.read.vouchers[i]) } : file.read;
            download((await tallyReadWorkbook(read)).bytes, `${name}.xlsx`, XLSX_TYPE);
          }}
        >
          Download Excel
        </button>
      </div>
      <XmlPreview xml={outXml} />
      <details className="mt-4">
        <summary className="cursor-pointer text-sm underline">How to export other data from Tally</summary>
        <div className="mt-2">{howTo}</div>
      </details>
    </Bench>
  );
}
