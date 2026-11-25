'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { XLSX_TYPE } from '@/lib/gst/excel';
import { FIELDS, STATUS_LABEL, dayText, readRegister, reconcile, registerDocs, taxOf, totals, twoBDocs, type Doc, type Field, type Line, type Register, type Status } from '@/lib/gst/recon2b';
import { Notice, Spinner, download, sizeProblem, type ToolProps } from './kit';
import { Chip, Drop, Section } from './gst/ReturnUI';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** SheetJS and the GSTR-2B reader load on first use. */
let corePromise: Promise<{ XLSX: any; core: any }> | null = null;
const loadCore = () =>
  (corePromise ??= Promise.all([import('xlsx'), import('exceljs'), import('@/lib/gst/gstr2b')]).then(([XLSX, ExcelJS, m]) => ({ XLSX, core: m.makeGstr2b(XLSX, ExcelJS.default) })));

interface TwoBFile {
  id: number;
  name: string;
  docs: Doc[];
  /** What the file is, in a few words: GSTIN and month, or "merged workbook". */
  what: string;
  errors: string[];
  warnings: string[];
}

interface Books {
  name: string;
  sheets: string[];
  sheet: string;
  aoa: unknown[][];
  reg: Register;
}

const fmtAmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = new Intl.NumberFormat('en-IN');
const money = (x: number) => `${x < -0.004 ? '−' : ''}₹${fmtAmt.format(Math.abs(x))}`;
const ORDER: Status[] = ['matched', 'differs', 'probable', 'only2b', 'onlyBooks', 'outside'];
const TONE: Record<Status, 'ok' | 'warn' | 'err' | 'mut'> = { matched: 'ok', differs: 'warn', probable: 'warn', only2b: 'err', onlyBooks: 'err', outside: 'mut' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthOf = (m: number | null | undefined) => {
  if (m == null) return '';
  const t = new Date(Date.UTC(1899, 11, 30) + m * 86400000);
  return `${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
};
const SHOWN = 300;

export default function Gstr2bVsPurchaseRegister(props: ToolProps) {
  const [lib, setLib] = useState<{ XLSX: any; core: any } | null>(null);
  const [twoB, setTwoB] = useState<TwoBFile[]>([]);
  const [books, setBooks] = useState<Books | null>(null);
  const [tol, setTol] = useState('1');
  const [dates, setDates] = useState(false);
  const [show, setShow] = useState<Status | 'all'>('all');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'bad' | 'info'; text: string } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    loadCore()
      .then(setLib)
      .catch(() => setNotice({ tone: 'bad', text: 'The Excel reader could not load. Check your connection and reload the page.' }));
  }, []);

  const readBook = async (f: File) => lib!.XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array', cellDates: false });

  /** GSTR-2B: portal downloads (any months, any of your GSTINs) or a merged workbook. */
  const addTwoB = async (list: File[]) => {
    if (!lib) return;
    setNotice(null);
    const added: TwoBFile[] = [];
    const problems: string[] = [];
    for (const f of list) {
      const p = sizeProblem(f, props);
      if (p) {
        problems.push(p);
        continue;
      }
      setBusy(`Reading ${f.name}…`);
      try {
        const wb = await readBook(f);
        const kind = lib.core.sniff(wb);
        if (kind === 'master') {
          const m = lib.core.parseMaster(wb, f.name);
          added.push({ id: ++seq.current, name: f.name, docs: twoBDocs(m.sheets, { file: f.name }), what: 'Merged GSTR-2B workbook', errors: m.errors, warnings: m.warnings });
        } else if (kind === 'portal') {
          const p2 = lib.core.parsePortal(wb, f.name);
          added.push({ id: ++seq.current, name: f.name, docs: twoBDocs(p2.sheets, { ours: p2.gstin ?? undefined, file: f.name }), what: `${p2.gstin ?? 'GSTIN not found'} · ${monthOf(p2.monthSerial)}`, errors: p2.errors, warnings: p2.warnings });
        } else problems.push(`${f.name} is not a GSTR-2B download or a merged GSTR-2B workbook. If it is your purchase register, add it on the right.`);
      } catch {
        problems.push(`${f.name} could not be opened as an Excel workbook.`);
      }
    }
    setBusy('');
    setTwoB((cur) => [...cur, ...added]);
    if (problems.length) setNotice({ tone: 'warn', text: problems.join(' ') });
  };

  /** The purchase register: the sheet with the most rows, its headings found automatically. */
  const chooseSheet = (wb: any, name: string, sheet: string): Books => {
    const aoa = lib!.XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, defval: null, blankrows: false }) as unknown[][];
    return { name, sheets: wb.SheetNames, sheet, aoa, reg: readRegister(aoa) };
  };
  const wbRef = useRef<any>(null);
  const addBooks = async (list: File[]) => {
    if (!lib || !list.length) return;
    setNotice(null);
    const f = list[0];
    const p = sizeProblem(f, props);
    if (p) return setNotice({ tone: 'bad', text: p });
    setBusy(`Reading ${f.name}…`);
    try {
      const wb = await readBook(f);
      if (lib.core.sniff(wb) !== 'unknown') {
        setNotice({ tone: 'warn', text: `${f.name} is a GSTR-2B file, so it was added on the left.` });
        setBusy('');
        return addTwoB([f]);
      }
      wbRef.current = wb;
      const rows = (s: string) => (lib.XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, blankrows: false }) as unknown[]).length;
      const sheet = [...wb.SheetNames].sort((a: string, b: string) => rows(b) - rows(a))[0];
      setBooks(chooseSheet(wb, f.name, sheet));
    } catch {
      setNotice({ tone: 'bad', text: `${f.name} could not be opened. Save the purchase register as .xlsx, .xls or .csv.` });
    }
    setBusy('');
  };

  const read = useMemo(() => (books ? registerDocs(books.aoa, books.reg) : null), [books]);
  const twoBDocsAll = useMemo(() => twoB.flatMap((f) => f.docs), [twoB]);
  const tolNum = Math.max(0, Number(tol) || 0);
  const result = useMemo(() => (read && twoBDocsAll.length && read.docs.length ? reconcile(twoBDocsAll, read.docs, { tol: tolNum, dates }) : null), [read, twoBDocsAll, tolNum, dates]);
  const sums = useMemo(() => (result ? totals(result.lines) : null), [result]);
  const shownLines = useMemo(() => (result ? result.lines.filter((l) => show === 'all' || l.status === show) : []), [result, show]);

  const setMap = (f: Field, cols: number[]) => books && setBooks({ ...books, reg: { ...books.reg, mapping: { ...books.reg.mapping, [f]: cols } } });
  const setHeader = (row: number) => {
    if (!books) return;
    setBooks({ ...books, reg: readRegister(books.aoa, Math.min(row, books.aoa.length - 1)) });
  };

  const save = async () => {
    if (!result) return;
    setBusy('Writing the Excel report…');
    try {
      const { reconWorkbook } = await import('@/lib/gst/recon2b-excel');
      const months = result.months ? `${monthOf(result.months[0])} to ${monthOf(result.months[1])}` : 'months not known';
      const d = new Date();
      const bytes = await reconWorkbook(result, {
        twoB: `${twoB.length} file${twoB.length === 1 ? '' : 's'}, ${months}, ${twoBDocsAll.length} documents`,
        books: `${books!.name} (${books!.sheet}), ${read!.docs.length} documents with a supplier GSTIN`,
        tol: tolNum,
        date: `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`,
      });
      download(bytes, 'GSTR-2B vs purchase register.xlsx', XLSX_TYPE);
    } catch (e) {
      setNotice({ tone: 'bad', text: `The report could not be written: ${(e as Error).message}` });
    }
    setBusy('');
  };

  const missing = books ? FIELDS.filter((f) => f.need && !books.reg.mapping[f.key].length) : [];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="label mb-2">1 · GSTR-2B</p>
          <Drop accept=".xlsx,.xls,.xlsm" title="GSTR-2B Excel files" hint="As downloaded from the GST portal, any months and GSTINs; or your merged GSTR-2B workbook." onFiles={addTwoB} />
          {twoB.length > 0 && (
            <ul className="mt-2 space-y-1 text-[0.88rem]">
              {twoB.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2 border-b border-rule py-1">
                  <span className="min-w-0 flex-1 truncate" title={f.name}>
                    {f.name}
                  </span>
                  <span className="text-ink-3">{f.what}</span>
                  <Chip tone={f.errors.length ? 'err' : f.docs.length ? 'ok' : 'warn'}>{fmtInt.format(f.docs.length)} documents</Chip>
                  <button type="button" className="text-ink-3 underline" onClick={() => setTwoB(twoB.filter((x) => x.id !== f.id))}>
                    Remove
                  </button>
                  {[...f.errors, ...f.warnings].map((m) => (
                    <span key={m} className="w-full text-[0.8rem]" style={{ color: f.errors.includes(m) ? 'var(--bad)' : 'var(--warn)' }}>
                      {m}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="label mb-2">2 · Purchase register</p>
          <Drop accept=".xlsx,.xls,.xlsm,.csv" title="Purchase register" hint="From Tally, Busy, SAP or your own Excel or CSV: one row per bill, with the supplier GSTIN and invoice number." onFiles={addBooks} />
          {books && read && (
            <div className="mt-2 text-[0.88rem]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{books.name}</span>
                {books.sheets.length > 1 && (
                  <select className="field !w-auto !py-1" aria-label="Sheet" value={books.sheet} onChange={(e) => setBooks(chooseSheet(wbRef.current, books.name, e.target.value))}>
                    {books.sheets.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                )}
                <Chip tone={read.docs.length ? 'ok' : 'err'}>{fmtInt.format(read.docs.length)} bills</Chip>
              </div>
              {(read.noGstin > 0 || read.noNumber > 0) && (
                <p className="mt-1 text-[0.8rem] text-ink-3">
                  Left out: {read.noGstin > 0 && `${fmtInt.format(read.noGstin)} rows without a supplier GSTIN (unregistered suppliers, totals)`}
                  {read.noGstin > 0 && read.noNumber > 0 && '; '}
                  {read.noNumber > 0 && `${fmtInt.format(read.noNumber)} rows without an invoice number`}.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {busy && <Spinner text={busy} />}
      {!lib && !notice && <Spinner text="Loading the Excel reader…" />}
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {books && (
        <Section
          title="Columns of the purchase register"
          aside={
            <label className="flex items-center gap-2 text-[0.88rem]">
              Headings on row
              <input className="field !w-20 !py-1" type="number" min={1} max={Math.min(books.aoa.length, 60)} value={books.reg.header + 1} onChange={(e) => setHeader(Math.max(0, Number(e.target.value) - 1))} />
            </label>
          }
        >
          <p className="mb-3 text-[0.88rem] text-ink-2">Found from the headings. Correct any that are wrong; tax split over several columns (IGST @5%, IGST @18%…) is added together.</p>
          <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {/* Our own GSTIN column is only kept apart from the supplier GSTIN, not compared. */}
            {FIELDS.filter((f) => f.key !== 'ours').map((f) => {
              const cols = books.reg.mapping[f.key];
              const many = ['igst', 'cgst', 'sgst', 'cess'].includes(f.key);
              return (
                <div key={f.key} className="text-[0.88rem]">
                  <span className="label mb-1 block">
                    {f.label}
                    {f.need && <span style={{ color: 'var(--bad)' }}> *</span>}
                  </span>
                  {many ? (
                    <details className="border border-rule bg-card">
                      <summary className="cursor-pointer px-2 py-1.5">{cols.length ? cols.map((c) => books.reg.columns[c]).join(' + ') : 'Not in the register'}</summary>
                      <div className="max-h-52 overflow-auto border-t border-rule px-2 py-1">
                        {books.reg.columns.map((h, c) => (
                          <label key={c} className="flex items-center gap-2 py-0.5">
                            <input type="checkbox" checked={cols.includes(c)} onChange={(e) => setMap(f.key, e.target.checked ? [...cols, c].sort((a, b) => a - b) : cols.filter((x) => x !== c))} />
                            {h}
                          </label>
                        ))}
                      </div>
                    </details>
                  ) : (
                    <select className="field !py-1.5" value={cols[0] ?? -1} onChange={(e) => setMap(f.key, Number(e.target.value) < 0 ? [] : [Number(e.target.value)])}>
                      <option value={-1}>Not in the register</option>
                      {books.reg.columns.map((h, c) => (
                        <option key={c} value={c}>
                          {h}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
          {missing.length > 0 && <Notice tone="bad">Choose the column for: {missing.map((f) => f.label).join(', ')}.</Notice>}
          {read && read.docs.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <p className="label mb-1">First bills as read</p>
              <table className="w-full min-w-[640px] border-collapse text-[0.82rem]">
                <thead>
                  <tr className="border-b border-ink text-left">
                    {['Row', 'Supplier GSTIN', 'Supplier', 'Invoice no.', 'Date', 'Taxable', 'Tax'].map((h) => (
                      <th key={h} className="label py-1.5 pr-3 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {read.docs.slice(0, 5).map((d) => (
                    <tr key={d.row} className="border-b border-rule">
                      <td className="py-1 pr-3 font-mono text-ink-3">{d.row}</td>
                      <td className="py-1 pr-3 font-mono">{d.gstin}</td>
                      <td className="max-w-[14rem] truncate py-1 pr-3">{d.name}</td>
                      <td className="py-1 pr-3">{d.no}</td>
                      <td className="py-1 pr-3">{dayText(d.date)}</td>
                      <td className="py-1 pr-3 text-right font-mono">{fmtAmt.format(d.taxable)}</td>
                      <td className="py-1 pr-3 text-right font-mono">{fmtAmt.format(taxOf(d))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {result && sums && (
        <Section
          title="Reconciliation"
          aside={
            <>
              <label className="flex items-center gap-2 text-[0.88rem]">
                Treat as equal within ₹
                <input className="field !w-20 !py-1" inputMode="decimal" value={tol} onChange={(e) => setTol(e.target.value.replace(/[^\d.]/g, ''))} />
              </label>
              <label className="flex items-center gap-2 text-[0.88rem]">
                <input type="checkbox" checked={dates} onChange={(e) => setDates(e.target.checked)} />
                Different dates count as a difference
              </label>
              <button type="button" className="btn" disabled={!!busy} onClick={() => void save()}>
                Download Excel report
              </button>
            </>
          }
        >
          <p className="mb-3 text-[0.9rem] text-ink-2">
            GSTR-2B {result.months ? `${monthOf(result.months[0])} to ${monthOf(result.months[1])}` : ''}: ITC {money(sums.all.tax2b)}. Books for the same months: {money(sums.all.taxBooks - sums.outside.taxBooks)}. Difference {money(sums.all.tax2b - (sums.all.taxBooks - sums.outside.taxBooks))}.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ORDER.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={show === k}
                onClick={() => setShow(show === k ? 'all' : k)}
                className={`border px-3 py-2 text-left ${show === k ? 'border-ink bg-paper-2' : 'border-rule bg-card hover:bg-paper-2'}`}
              >
                <Chip tone={TONE[k]}>{STATUS_LABEL[k]}</Chip>
                <span className="display mt-1 block text-[1.4rem]">{fmtInt.format(sums[k].count)}</span>
                <span className="block font-mono text-[0.78rem] text-ink-3">
                  {k === 'onlyBooks' || k === 'outside' ? money(sums[k].taxBooks) : money(sums[k].tax2b)}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 max-h-[32rem] overflow-auto">
            <table className="w-full min-w-[1000px] border-collapse text-[0.82rem]">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-ink text-left">
                  {['Result', 'Supplier', 'Invoice no. (2B / books)', 'Date', 'Tax in 2B', 'Tax in books', 'Difference', 'Notes'].map((h) => (
                    <th key={h} className="label py-1.5 pr-3 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownLines.slice(0, SHOWN).map((l: Line, i) => {
                  const d = l.b2 ?? l.bk!;
                  return (
                    <tr key={i} className="border-b border-rule align-top">
                      <td className="py-1 pr-3">
                        <Chip tone={TONE[l.status]}>{STATUS_LABEL[l.status]}</Chip>
                      </td>
                      <td className="py-1 pr-3">
                        <span className="block font-mono">{d.gstin}</span>
                        <span className="block max-w-[14rem] truncate text-ink-3">{l.b2?.name || l.bk?.name}</span>
                      </td>
                      <td className="py-1 pr-3">
                        {l.b2?.no ?? '—'}
                        <span className="text-ink-3"> / {l.bk?.no ?? '—'}</span>
                        {d.kind !== 'Invoice' && <span className="block text-ink-3">{d.kind}</span>}
                      </td>
                      <td className="py-1 pr-3">{dayText(l.b2?.date ?? l.bk?.date ?? null)}</td>
                      <td className="py-1 pr-3 text-right font-mono">{l.b2 ? fmtAmt.format(taxOf(l.b2)) : ''}</td>
                      <td className="py-1 pr-3 text-right font-mono">{l.bk ? fmtAmt.format(taxOf(l.bk)) : ''}</td>
                      <td className="py-1 pr-3 text-right font-mono" style={{ color: Math.abs(l.diff.tax) > tolNum ? 'var(--warn)' : undefined }}>
                        {fmtAmt.format(l.diff.tax)}
                      </td>
                      <td className="max-w-[22rem] py-1 pr-3 text-ink-2">{l.notes.join('; ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shownLines.length > SHOWN && <p className="mt-2 text-[0.85rem] text-ink-3">The first {SHOWN} of {fmtInt.format(shownLines.length)} are shown; the Excel report has all of them.</p>}
          </div>
        </Section>
      )}
      {twoB.length > 0 && read && !read.docs.length && !missing.length && <Notice tone="warn">No bills with a supplier GSTIN were found in the purchase register. Check the columns above.</Notice>}
    </div>
  );
}
