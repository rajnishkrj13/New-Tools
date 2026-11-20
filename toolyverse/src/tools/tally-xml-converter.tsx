'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { isTallyXml, readTally, type TallyRead } from '@/lib/tally/read';
import { convertTallyXml, type ConvertResult } from '@/lib/tally/convert';
import type { XNode } from '@/lib/tally/xml';
import { Bench, FileDrop, Notice, Spinner, baseName, download, formatSize, type ToolProps } from './kit';
import { ProfileOptions, SectionTitle, XML_TYPE, readUpload, useProfile } from './tally/shared';

interface Loaded {
  name: string;
  size: number;
  text: string;
  root: XNode;
  read: TallyRead;
}

export default function TallyXmlConverter(props: ToolProps) {
  const prof = useProfile();
  const [file, setFile] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notTally, setNotTally] = useState(false);
  const [keepTypes, setKeepTypes] = useState<string[]>([]);
  const [ledgers, setLedgers] = useState<Record<string, string>>({});
  const [types, setTypes] = useState<Record<string, string>>({});
  const [stripIds, setStripIds] = useState(true);
  const [dropEmpty, setDropEmpty] = useState(true);
  const [withMasters, setWithMasters] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filter, setFilter] = useState('');
  const [out, setOut] = useState<{ vouchers: ConvertResult | null; masters: ConvertResult | null } | null>(null);

  const open = async (f: File) => {
    setError(null);
    setNotTally(false);
    setOut(null);
    setBusy('Reading the XML…');
    try {
      const up = await readUpload(f, ['xml']);
      if (up.kind !== 'xml') return;
      const root = up.parsed.root;
      if (!root) throw new Error(`This XML cannot be read: ${up.parsed.problems.slice(0, 3).map((p) => `line ${p.line}: ${p.message}`).join(' ')}`);
      if (!isTallyXml(root)) {
        setNotTally(true);
        return;
      }
      const read = readTally(root);
      if (!read.vouchers.length && !read.masters.length) throw new Error('The file has no vouchers or masters to convert. Reports (Trial Balance and the like) can be opened in Excel with the Tally XML to Excel Converter.');
      setFile({ name: up.name, size: f.size, text: up.text, root, read });
      setKeepTypes([]);
      setLedgers({});
      setTypes({});
      prof.setCompany(read.company);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of file?.read.vouchers ?? []) m.set(v.type, (m.get(v.type) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [file]);
  const ledgerNames = useMemo(() => {
    const s = new Set<string>();
    for (const v of file?.read.vouchers ?? []) for (const e of v.entries) if (e.ledger) s.add(e.ledger);
    for (const m of file?.read.masters ?? []) if (m.kind === 'LEDGER') for (const r of m.rows) if (r.NAME) s.add(r.NAME);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [file]);

  if (notTally)
    return (
      <Bench>
        <Notice tone="info">
          This XML is not from Tally. To turn XML from other software into Tally vouchers, use the <Link className="underline" href="/xml-to-tally-converter">XML to Tally Converter</Link>, which matches its fields to voucher columns.
        </Notice>
        <button type="button" className="btn btn-ghost mt-3" onClick={() => setNotTally(false)}>
          Choose another file
        </button>
      </Bench>
    );

  if (!file)
    return (
      <>
        <FileDrop accept=".xml,text/xml,application/xml" onFiles={(f) => void open(f[0])} props={props} label="Choose a Tally XML file" hint="exported from Tally or made for import" />
        {busy && <Spinner text={busy} />}
        {error && <Notice tone="bad">{error}</Notice>}
      </>
    );

  const run = () => {
    setBusy('Converting…');
    setError(null);
    try {
      const base = { profile: prof.profile, ledgers, types, stripIds, dropEmpty, keepTypes, from: from || undefined, to: to || undefined };
      const vouchers = file.read.vouchers.length ? convertTallyXml(file.root, { ...base, vouchers: true, masters: false }) : null;
      const masters = withMasters && file.read.masters.length ? convertTallyXml(file.root, { ...base, vouchers: false, masters: true }) : null;
      setOut({ vouchers, masters });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const shownLedgers = ledgerNames.filter((n) => !filter || n.toLowerCase().includes(filter.toLowerCase()));
  const name = baseName(file.name);

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

      <SectionTitle n={1}>Target</SectionTitle>
      <div className="mt-3">
        <ProfileOptions p={prof} />
      </div>
      <div className="mt-3 grid gap-2 text-[0.92rem] sm:grid-cols-2">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={stripIds} onChange={(e) => setStripIds(e.target.checked)} />
          <span>Remove Tally&apos;s internal IDs (GUID, REMOTEID, ALTERID) so the entries import as new. Keep them only to update the same company&apos;s entries.</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={dropEmpty} onChange={(e) => setDropEmpty(e.target.checked)} />
          <span>Remove empty tags (smaller file, same data)</span>
        </label>
        {file.read.masters.length > 0 && (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={withMasters} onChange={(e) => setWithMasters(e.target.checked)} />
            <span>Also write the {file.read.masters.reduce((n, m) => n + m.rows.length, 0)} masters (as a separate file, to import first)</span>
          </label>
        )}
      </div>

      {typeCounts.length > 0 && (
        <>
          <SectionTitle n={2}>Vouchers to keep</SectionTitle>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.92rem]">
            {typeCounts.map(([t, n]) => (
              <label key={t} className="flex items-center gap-1.5">
                <input type="checkbox" checked={!keepTypes.length || keepTypes.includes(t)} onChange={(e) => setKeepTypes((cur) => { const all = cur.length ? cur : typeCounts.map(([x]) => x); return e.target.checked ? [...new Set([...all, t])] : all.filter((x) => x !== t); })} />
                {t} ({n})
              </label>
            ))}
          </div>
          <div className="mt-3 grid max-w-md grid-cols-2 gap-2">
            <label className="block">
              <span className="label mb-1 block">From date</span>
              <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="block">
              <span className="label mb-1 block">To date</span>
              <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <div className="mt-3">
            <span className="label">Rename voucher types (blank keeps the name)</span>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {typeCounts.map(([t]) => (
                <label key={t} className="grid grid-cols-[10rem_1fr] items-center gap-2 text-sm">
                  <span className="truncate">{t}</span>
                  <input className="field !min-h-8 py-0.5" placeholder={t} value={types[t] ?? ''} onChange={(e) => setTypes({ ...types, [t]: e.target.value })} />
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      <SectionTitle n={3}>Rename ledgers ({ledgerNames.length})</SectionTitle>
      <p className="mt-1 text-sm text-ink-2">For a company where the same accounts have other names. Only names you fill in change.</p>
      <input className="field !min-h-9 mt-2 max-w-xs py-1 text-sm" placeholder="Filter ledgers…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter ledgers" />
      <div className="mt-2 max-h-72 overflow-y-auto border border-rule">
        {shownLedgers.slice(0, 500).map((n) => (
          <label key={n} className="grid grid-cols-[1fr_1fr] items-center gap-2 border-b border-rule px-2 py-1 text-sm last:border-b-0">
            <span className="truncate" title={n}>
              {n}
            </span>
            <input className="field !min-h-8 py-0.5" placeholder="new name" value={ledgers[n] ?? ''} onChange={(e) => setLedgers({ ...ledgers, [n]: e.target.value })} />
          </label>
        ))}
      </div>

      <button type="button" className="btn mt-5" disabled={!!busy} onClick={run}>
        Convert
      </button>
      {busy && <Spinner text={busy} />}
      {error && <Notice tone="bad">{error}</Notice>}

      {out && (
        <>
          <SectionTitle n={4}>Result</SectionTitle>
          {[out.masters, out.vouchers].filter(Boolean).map((r, k) => {
            const res = r!;
            const isMasters = res === out.masters;
            return (
              <div key={k} className="mt-3 border border-rule p-3">
                <p className="font-semibold">
                  {isMasters ? `${res.masters} masters` : `${res.vouchers} vouchers`}
                  {Object.keys(res.changes).length ? ` · ${Object.entries(res.changes).map(([c, n]) => `${c}: ${n}`).join(' · ')}` : ' · no changes needed'}
                </p>
                <button type="button" className="btn mt-2" disabled={!(isMasters ? res.masters : res.vouchers)} onClick={() => download(new TextEncoder().encode(res.xml), `${name}-${isMasters ? 'masters' : 'vouchers'}-converted.xml`, XML_TYPE)}>
                  Download {isMasters ? 'masters' : 'vouchers'} XML
                </button>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div>
                    <span className="label">Source</span>
                    <pre className="mt-1 max-h-80 overflow-auto border border-rule bg-paper p-2 font-mono text-[0.75rem]">{file.text.slice(0, 15000)}</pre>
                  </div>
                  <div>
                    <span className="label">Converted</span>
                    <pre className="mt-1 max-h-80 overflow-auto border border-rule bg-paper p-2 font-mono text-[0.75rem]">{res.xml.slice(0, 15000)}</pre>
                  </div>
                </div>
              </div>
            );
          })}
          {out.masters && out.vouchers && <Notice tone="info">Import the masters file first, then the vouchers, so the ledgers exist when the vouchers arrive.</Notice>}
          <p className="mt-3 text-[0.8rem] text-ink-3">Every element of each voucher is carried over; only the changes listed above were made. Check the result with the Tally XML Validator before importing.</p>
        </>
      )}
    </Bench>
  );
}
