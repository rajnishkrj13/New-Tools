'use client';

import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { XLSX_TYPE } from '@/lib/gst/excel';
import {
  FIELDS,
  STATUS_LABEL,
  dayText,
  docKey,
  dues,
  followUps,
  fyOfDeadline,
  monthText,
  monthly,
  pairKey,
  readRegister,
  reconcile,
  registerDocs,
  suppliers,
  taxOf,
  todaySerial,
  totals,
  twoBDocs,
  twoBImports,
  twoBJson,
  type Decisions,
  type Doc,
  type Due,
  type Field,
  type Line,
  type Options,
  type Register,
  type Result,
  type Status,
} from '@/lib/gst/recon2b';
import { Notice, Segmented, Spinner, download, sizeProblem, useCopy, type ToolProps } from './kit';
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
  /** The layout as found (its headings), under which your corrections are remembered. */
  sig: string;
  /** Columns as you set them last time for this layout, or just changed by you. */
  memo: 'recalled' | 'saved' | null;
}

const fmtAmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = new Intl.NumberFormat('en-IN');
const money = (x: number) => `${x < -0.004 ? '−' : ''}₹${fmtAmt.format(Math.abs(x))}`;
const ORDER: Status[] = ['matched', 'differs', 'probable', 'only2b', 'onlyBooks', 'outside'];
const TONE: Record<Status, 'ok' | 'warn' | 'err' | 'mut'> = { matched: 'ok', differs: 'warn', probable: 'warn', only2b: 'err', onlyBooks: 'err', outside: 'mut' };
const OPEN: Status[] = ['only2b', 'onlyBooks', 'differs', 'probable'];
const OPEN_TEXT: Partial<Record<Status, string>> = { only2b: 'in 2B, not in your books', onlyBooks: 'in your books, not in 2B', differs: 'with amounts differing', probable: 'probable matches to confirm' };
const SHOWN = 300;
/** Above this many bills (both sides together), matching runs in a worker so the page does not freeze. */
const BIG = 4000;
const NONE: Decisions = { pairs: [], accept: [], reject: [] };

// ---- Columns remembered per register layout ---------------------------------------------------

const MEMORY = 'toolyverse:gstr2b-vs-pr:columns';
type Memory = Record<string, { header: number; mapping: Register['mapping'] }>;
const sigOf = (reg: Register) => reg.columns.join('\u0001');
const recall = (): Memory => {
  try {
    return JSON.parse(localStorage.getItem(MEMORY) || '{}') as Memory;
  } catch {
    return {};
  }
};
/** Keeps your columns for this layout (the last 20 layouts), or forgets them. */
function remember(sig: string, reg: Register | null) {
  try {
    const m = recall();
    delete m[sig];
    if (reg) m[sig] = { header: reg.header, mapping: reg.mapping };
    const keys = Object.keys(m);
    for (const k of keys.slice(0, Math.max(0, keys.length - 20))) delete m[k];
    localStorage.setItem(MEMORY, JSON.stringify(m));
  } catch {
    // Private browsing or storage turned off: nothing is remembered.
  }
}

const lineId = (l: Line) => (l.b2 ? `b\n${docKey(l.b2)}` : `k\n${docKey(l.bk!)}`);
const lineDoc = (l: Line) => l.b2 ?? l.bk!;
const panOf = (g: string) => g.slice(2, 12);
const hay = (l: Line) => [l.b2?.gstin, l.bk?.gstin, l.b2?.name, l.bk?.name, l.b2?.no, l.bk?.no, l.notes.join(' ')].join(' ').toLowerCase();
const daysText = (n: number) => (n === 0 ? 'today is the last day' : n === 1 ? '1 day left' : `${n} days left`);

export default function Gstr2bVsPurchaseRegister(props: ToolProps) {
  const [lib, setLib] = useState<{ XLSX: any; core: any } | null>(null);
  const [twoB, setTwoB] = useState<TwoBFile[]>([]);
  const [books, setBooks] = useState<Books | null>(null);
  const [tol, setTol] = useState('1');
  const [dates, setDates] = useState(false);
  const [decisions, setDecisions] = useState<Decisions>(NONE);
  const [today] = useState(() => todaySerial());
  const [view, setView] = useState<'bills' | 'months' | 'suppliers'>('bills');
  const [show, setShow] = useState<Status | 'all'>('all');
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim().toLowerCase());
  const [supplier, setSupplier] = useState<string | null>(null);
  const [dueOnly, setDueOnly] = useState(false);
  const [limit, setLimit] = useState(SHOWN);
  const [pairing, setPairing] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'bad' | 'info'; text: string } | null>(null);
  const seq = useRef(0);
  const { copied, copy } = useCopy();

  useEffect(() => {
    loadCore()
      .then(setLib)
      .catch(() => setNotice({ tone: 'bad', text: 'The Excel reader could not load. Check your connection and reload the page.' }));
  }, []);

  const readBook = async (f: File) => lib!.XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array', cellDates: false });
  const aoaOf = (ws: any) => lib!.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false }) as unknown[][];

  /** GSTR-2B: portal downloads (any months, any of your GSTINs) or a merged workbook. */
  const addTwoB = async (list: File[], note?: string) => {
    if (!lib) return;
    setNotice(null);
    const added: TwoBFile[] = [];
    const problems: string[] = note ? [note] : [];
    for (const f of list) {
      const p = sizeProblem(f, props);
      if (p) {
        problems.push(p);
        continue;
      }
      setBusy(`Reading ${f.name}…`);
      // JSON from the portal, as it comes or zipped.
      if (/\.(json|zip)$/i.test(f.name)) {
        try {
          const jsons: { name: string; text: string }[] = [];
          if (/\.zip$/i.test(f.name)) {
            const zip = await (await import('jszip')).default.loadAsync(await f.arrayBuffer());
            for (const e of Object.values(zip.files)) if (!e.dir && /\.json$/i.test(e.name)) jsons.push({ name: e.name.split('/').pop()!, text: await e.async('string') });
            if (!jsons.length) problems.push(`${f.name} has no JSON file inside.`);
          } else jsons.push({ name: f.name, text: await f.text() });
          for (const j of jsons) {
            const r = twoBJson(JSON.parse(j.text), j.name);
            if (!r.docs.length && r.errors.length) {
              problems.push(`${j.name}: ${r.errors.join(' ')}`);
              continue;
            }
            added.push({ id: ++seq.current, name: j.name, docs: r.docs, what: `${r.kind} JSON · ${r.gstin ?? 'GSTIN not given'} · ${monthText(r.month)}`, errors: r.errors, warnings: r.warnings });
          }
        } catch {
          problems.push(`${f.name} could not be read as a GSTR-2B JSON file.`);
        }
        continue;
      }
      try {
        const wb = await readBook(f);
        const kind = lib.core.sniff(wb);
        if (kind === 'master') {
          const m = lib.core.parseMaster(wb, f.name);
          added.push({ id: ++seq.current, name: f.name, docs: twoBDocs(m.sheets, { file: f.name }), what: 'Merged GSTR-2B workbook', errors: m.errors, warnings: m.warnings });
        } else if (kind === 'portal') {
          const p2 = lib.core.parsePortal(wb, f.name);
          const opts = { month: p2.monthSerial, ours: p2.gstin ?? undefined, file: f.name };
          // Imports, from their own sheets.
          const imports = (['IMPG', 'IMPGSEZ'] as const).flatMap((name) => {
            const sn = (wb.SheetNames as string[]).find((s) => s.replace(/[\s-]/g, '').toUpperCase() === name);
            return sn ? twoBImports(aoaOf(wb.Sheets[sn]), name, opts) : [];
          });
          added.push({ id: ++seq.current, name: f.name, docs: [...twoBDocs(p2.sheets, opts), ...imports], what: `${p2.gstin ?? 'GSTIN not found'} · ${monthText(p2.monthSerial)}`, errors: p2.errors, warnings: p2.warnings });
        } else problems.push(`${f.name} is not a GSTR-2B download or a merged GSTR-2B workbook. If it is your purchase register, add it on the right.`);
      } catch {
        problems.push(`${f.name} could not be opened as an Excel workbook.`);
      }
    }
    setBusy('');
    setTwoB((cur) => [...cur, ...added]);
    if (problems.length) setNotice({ tone: 'warn', text: problems.join(' ') });
  };

  /** The purchase register: the sheet with the most rows, its headings found automatically (or as you set them last time). */
  const chooseSheet = (wb: any, name: string, sheet: string): Books => {
    const aoa = aoaOf(wb.Sheets[sheet]);
    const auto = readRegister(aoa);
    const sig = sigOf(auto);
    const saved = recall()[sig];
    if (!saved) return { name, sheets: wb.SheetNames, sheet, aoa, reg: auto, sig, memo: null };
    const reg = saved.header === auto.header ? auto : readRegister(aoa, Math.min(saved.header, aoa.length - 1));
    const mapping = Object.fromEntries(Object.entries(reg.mapping).map(([f, cols]) => [f, (saved.mapping[f as Field] ?? cols).filter((c) => c < reg.columns.length)])) as Register['mapping'];
    return { name, sheets: wb.SheetNames, sheet, aoa, reg: { ...reg, mapping }, sig, memo: 'recalled' };
  };
  const wbRef = useRef<any>(null);
  const addBooks = async (list: File[]) => {
    if (!lib || !list.length) return;
    setNotice(null);
    const f = list[0];
    const p = sizeProblem(f, props);
    if (p) return setNotice({ tone: 'bad', text: p });
    if (/\.(json|zip)$/i.test(f.name)) return addTwoB([f], `${f.name} is a GSTR-2B JSON file, so it was added on the left.`);
    setBusy(`Reading ${f.name}…`);
    try {
      const wb = await readBook(f);
      if (lib.core.sniff(wb) !== 'unknown') {
        setBusy('');
        return addTwoB([f], `${f.name} is a GSTR-2B file, so it was added on the left.`);
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

  const setReg = (reg: Register) => {
    if (!books) return;
    remember(books.sig, reg);
    setBooks({ ...books, reg, memo: 'saved' });
  };
  const setMap = (f: Field, cols: number[]) => books && setReg({ ...books.reg, mapping: { ...books.reg.mapping, [f]: cols } });
  const setHeader = (row: number) => books && setReg(readRegister(books.aoa, Math.min(row, books.aoa.length - 1)));
  const findAgain = () => {
    if (!books) return;
    remember(books.sig, null);
    setBooks({ ...books, reg: readRegister(books.aoa), memo: null });
  };

  // ---- Matching: here for a few thousand bills, in a worker beyond that -------------------------

  const read = useMemo(() => (books ? registerDocs(books.aoa, books.reg) : null), [books]);
  const twoBDocsAll = useMemo(() => twoB.flatMap((f) => f.docs), [twoB]);
  const tolNum = Math.max(0, Number(tol) || 0);
  const job = useMemo<{ twoB: Doc[]; books: Doc[]; opt: Options } | null>(
    () => (read && twoBDocsAll.length && read.docs.length ? { twoB: twoBDocsAll, books: read.docs, opt: { tol: tolNum, dates, today, decisions } } : null),
    [read, twoBDocsAll, tolNum, dates, today, decisions],
  );
  const big = !!job && job.twoB.length + job.books.length > BIG;
  const quick = useMemo(() => (job && !big ? reconcile(job.twoB, job.books, job.opt) : null), [job, big]);
  const [done, setDone] = useState<{ job: NonNullable<typeof job>; result: Result } | null>(null);
  const worker = useRef<Worker | null>(null);
  const jobs = useRef(0);
  useEffect(() => {
    if (!job || !big) return;
    const here = () => setDone({ job, result: reconcile(job.twoB, job.books, job.opt) });
    if (!worker.current) {
      try {
        worker.current = new Worker(new URL('../lib/gst/recon2b.worker.ts', import.meta.url), { type: 'module' });
      } catch {
        worker.current = null;
      }
    }
    const w = worker.current;
    if (!w) {
      const t = setTimeout(here, 0);
      return () => clearTimeout(t);
    }
    const id = ++jobs.current;
    const onMessage = (e: MessageEvent<{ id: number; result?: Result; error?: string }>) => {
      if (e.data.id !== id) return;
      if (e.data.result) setDone({ job, result: e.data.result });
      else here();
    };
    // The worker could not start (an old browser, a blocked script): match here instead.
    const onError = () => {
      worker.current = null;
      here();
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, ...job });
    return () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
  }, [job, big]);
  useEffect(() => () => worker.current?.terminate(), []);
  // While a large register is being matched again, the last result stays on screen.
  const result = big ? (done?.result ?? null) : quick;
  const matching = big && done?.job !== job;

  const sums = useMemo(() => (result ? totals(result.lines) : null), [result]);
  const due = useMemo(() => (result ? dues(result.lines, today) : null), [result, today]);
  const months = useMemo(() => (result ? monthly(result) : []), [result]);
  const sups = useMemo(() => (result ? suppliers(result.lines) : []), [result]);
  const follow = useMemo(() => (result ? new Map(followUps(result, { today }).map((f) => [f.gstin, f])) : new Map()), [result, today]);
  const isDue = (l: Line) => l.deadline != null && OPEN.includes(l.status) && l.deadline - today <= 60;
  const shownLines = useMemo(
    () =>
      result
        ? result.lines.filter(
            (l) =>
              (show === 'all' || l.status === show) &&
              (supplier == null || lineDoc(l).gstin === supplier) &&
              (!dueOnly || (l.deadline != null && OPEN.includes(l.status) && l.deadline - today <= 60)) &&
              (!q || hay(l).includes(q)),
          )
        : [],
    [result, show, supplier, dueOnly, q, today],
  );
  const shownSups = useMemo(() => (q ? sups.filter((s) => `${s.gstin} ${s.name}`.toLowerCase().includes(q)) : sups), [sups, q]);

  // ---- Your decisions -----------------------------------------------------------------------------

  const decide = (kind: keyof Decisions, key: string, on: boolean) =>
    setDecisions((d) => {
      const next = { ...d, [kind]: d[kind].filter((x) => x !== key) };
      if (on) next[kind] = [...next[kind], key];
      // Pairing two bills undoes turning them down.
      if (kind === 'pairs' && on) next.reject = next.reject.filter((x) => x !== key);
      return next;
    });
  const nDecided = decisions.pairs.length + decisions.accept.length + decisions.reject.length;
  const pairLine = result && pairing ? result.lines.find((l) => lineId(l) === pairing) : undefined;
  // Bills to pair with: missing on the other side, of the same PAN (or imports with imports).
  const pairOptions = useMemo(() => {
    if (!result || !pairLine) return [];
    const d = lineDoc(pairLine);
    const want: Status[] = pairLine.b2 ? ['onlyBooks', 'outside'] : ['only2b'];
    return result.lines.filter((x) => {
      const o = lineDoc(x);
      return want.includes(x.status) && (d.gstin ? !!o.gstin && panOf(o.gstin) === panOf(d.gstin) : !o.gstin);
    });
  }, [result, pairLine]);
  const [pairWith, setPairWith] = useState(0);

  const filter = (f: () => void) => {
    f();
    setLimit(SHOWN);
    setPairing(null);
  };

  const save = async () => {
    if (!result) return;
    setBusy('Writing the Excel report…');
    try {
      const { reconWorkbook } = await import('@/lib/gst/recon2b-excel');
      const span = result.months ? `${monthText(result.months[0])} to ${monthText(result.months[1])}` : 'months not known';
      const d = new Date();
      const bytes = await reconWorkbook(result, {
        twoB: `${twoB.length} file${twoB.length === 1 ? '' : 's'}, ${span}, ${twoBDocsAll.length} documents`,
        books: `${books!.name} (${books!.sheet}), ${read!.docs.length} documents with a supplier GSTIN or bill of entry`,
        tol: tolNum,
        date: `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`,
        today,
      });
      download(bytes, 'GSTR-2B vs purchase register.xlsx', XLSX_TYPE);
    } catch (e) {
      setNotice({ tone: 'bad', text: `The report could not be written: ${(e as Error).message}` });
    }
    setBusy('');
  };

  const missing = books ? FIELDS.filter((f) => f.need && !books.reg.mapping[f.key].length) : [];
  const openText = (d: Due) =>
    Object.entries(d.by)
      .map(([k, v]) => `${fmtInt.format(v.count)} ${OPEN_TEXT[k as Status]} (${money(v.tax)})`)
      .join(', ');

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="label mb-2">1 · GSTR-2B</p>
          <Drop accept=".xlsx,.xls,.xlsm,.json,.zip" title="GSTR-2B files" hint="Excel or JSON as downloaded from the GST portal (a zipped JSON too), any months and GSTINs; or your merged GSTR-2B workbook." onFiles={addTwoB} />
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
          <Drop accept=".xlsx,.xls,.xlsm,.csv" title="Purchase register" hint="From Tally, Busy, SAP or your own Excel or CSV: one row per bill, with the supplier GSTIN and invoice number (imports: the bill of entry number)." onFiles={addBooks} />
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
                  Left out: {read.noGstin > 0 && `${fmtInt.format(read.noGstin)} rows without a supplier GSTIN or bill of entry (unregistered suppliers, totals)`}
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
          <p className="mb-3 text-[0.88rem] text-ink-2">
            {books.memo === 'recalled' ? 'As you set them last time for a register laid out like this one. ' : 'Found from the headings. Correct any that are wrong; tax split over several columns (IGST @5%, IGST @18%…) is added together. '}
            {books.memo === 'saved' && 'Your changes are remembered in this browser for registers laid out like this one. '}
            {books.memo && (
              <button type="button" className="underline" onClick={findAgain}>
                Find them again
              </button>
            )}
          </p>
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
                      <td className="py-1 pr-3 font-mono">{d.gstin || 'Import'}</td>
                      <td className="max-w-[14rem] truncate py-1 pr-3">{d.name}</td>
                      <td className="py-1 pr-3">{d.boe ? `${d.no} (BoE ${d.boe})` : d.no}</td>
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

      {matching && <Spinner text={`Matching ${fmtInt.format(job!.twoB.length)} GSTR-2B documents with ${fmtInt.format(job!.books.length)} bills…`} />}

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
              <button type="button" className="btn" disabled={!!busy || matching} onClick={() => void save()}>
                Download Excel report
              </button>
            </>
          }
        >
          <p className="mb-3 text-[0.9rem] text-ink-2">
            GSTR-2B {result.months ? `${monthText(result.months[0])} to ${monthText(result.months[1])}` : ''}: ITC {money(sums.all.tax2b)}. Books for the same months: {money(sums.all.taxBooks - sums.outside.taxBooks)}. Difference {money(sums.all.tax2b - (sums.all.taxBooks - sums.outside.taxBooks))}.
          </p>

          {due && (due.soon.length > 0 || due.barred.length > 0) && (
            <div className="mb-3 border-l-[3px] bg-card px-3 py-2 text-[0.9rem]" style={{ borderColor: due.soon.length ? 'var(--bad)' : 'var(--warn)' }} role="status">
              {due.soon.map((d) => (
                <p key={d.deadline}>
                  <strong style={{ color: 'var(--bad)' }}>
                    ITC on {fyOfDeadline(d.deadline)} bills has to be taken by {dayText(d.deadline)}
                  </strong>{' '}
                  ({daysText(d.deadline - today)}, Section 16(4)). Still open: {openText(d)}.
                </p>
              ))}
              {due.barred.map((d) => (
                <p key={d.deadline} className="text-ink-2">
                  Time-barred since {dayText(d.deadline)} ({fyOfDeadline(d.deadline)}): {openText(d)}. The ITC on these can no longer be taken.
                </p>
              ))}
              <button type="button" className="mt-1 underline" onClick={() => filter(() => {
                    setDueOnly(true);
                    setShow('all');
                    setView('bills');
                  })}>
                Show these bills
              </button>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ORDER.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={show === k}
                onClick={() => filter(() => {
                  setShow(show === k ? 'all' : k);
                  setView('bills');
                })}
                className={`border px-3 py-2 text-left ${show === k ? 'border-ink bg-paper-2' : 'border-rule bg-card hover:bg-paper-2'}`}
              >
                <Chip tone={TONE[k]}>{STATUS_LABEL[k]}</Chip>
                <span className="display mt-1 block text-[1.4rem]">{fmtInt.format(sums[k].count)}</span>
                <span className="block font-mono text-[0.78rem] text-ink-3">{k === 'onlyBooks' || k === 'outside' ? money(sums[k].taxBooks) : money(sums[k].tax2b)}</span>
              </button>
            ))}
          </div>

          {nDecided > 0 && (
            <p className="mt-3 text-[0.85rem] text-ink-2">
              Your decisions: {decisions.accept.length} probable {decisions.accept.length === 1 ? 'pair' : 'pairs'} confirmed, {decisions.pairs.length} paired by you, {decisions.reject.length} turned down.{' '}
              <button type="button" className="underline" onClick={() => setDecisions(NONE)}>
                Clear them
              </button>
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Segmented
              label="View"
              value={view}
              onChange={(v) => filter(() => setView(v))}
              options={[
                { value: 'bills', label: 'Bills' },
                { value: 'months', label: 'Month-wise' },
                { value: 'suppliers', label: 'By supplier' },
              ]}
            />
            {view !== 'months' && (
              <input className="field !w-auto min-w-0 flex-1 !py-1.5" type="search" placeholder="Search invoice no., GSTIN or name" aria-label="Search" value={query} onChange={(e) => filter(() => setQuery(e.target.value))} />
            )}
          </div>
          {view === 'bills' && (supplier != null || dueOnly) && (
            <p className="mt-2 flex flex-wrap gap-2 text-[0.85rem]">
              {supplier != null && (
                <button type="button" className="border border-rule bg-card px-2 py-0.5" onClick={() => filter(() => setSupplier(null))}>
                  Supplier: {supplier || 'Imports'} ✕
                </button>
              )}
              {dueOnly && (
                <button type="button" className="border border-rule bg-card px-2 py-0.5" onClick={() => filter(() => setDueOnly(false))}>
                  ITC time limit near or past ✕
                </button>
              )}
            </p>
          )}

          {view === 'bills' && (
            <div className="mt-3 max-h-[36rem] overflow-auto">
              <table className="w-full min-w-[1100px] border-collapse text-[0.82rem]">
                <thead className="sticky top-0 z-[1] bg-card">
                  <tr className="border-b border-ink text-left">
                    {['Result', 'Supplier', 'Invoice no. (2B / books)', 'Date', 'Tax in 2B', 'Tax in books', 'Difference', 'Notes', ''].map((h) => (
                      <th key={h} className="label py-1.5 pr-3 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownLines.slice(0, limit).map((l) => {
                    const d = lineDoc(l);
                    const id = lineId(l);
                    const key = l.b2 && l.bk ? pairKey(l.b2, l.bk) : '';
                    return (
                      <Fragment key={id}>
                        <tr className="border-b border-rule align-top">
                          <td className="py-1 pr-3">
                            <Chip tone={TONE[l.status]}>{STATUS_LABEL[l.status]}</Chip>
                          </td>
                          <td className="py-1 pr-3">
                            <span className="block font-mono">{d.gstin || 'Import'}</span>
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
                          <td className="max-w-[22rem] py-1 pr-3 text-ink-2" style={isDue(l) ? { color: 'var(--bad)' } : undefined}>
                            {l.notes.join('; ')}
                          </td>
                          <td className="whitespace-nowrap py-1 pr-1 text-right">
                            {l.status === 'probable' && (
                              <>
                                <button type="button" className="underline" onClick={() => decide('accept', key, true)}>
                                  Confirm
                                </button>
                                {' · '}
                                <button type="button" className="underline" onClick={() => decide('reject', key, true)}>
                                  Not a match
                                </button>
                              </>
                            )}
                            {l.decided && (
                              <button type="button" className="text-ink-3 underline" onClick={() => decide(l.decided === 'paired' ? 'pairs' : 'accept', key, false)}>
                                Undo
                              </button>
                            )}
                            {(l.status === 'only2b' || l.status === 'onlyBooks' || l.status === 'outside') && (
                              <button type="button" className="underline" aria-expanded={pairing === id} onClick={() => {
                                  setPairing(pairing === id ? null : id);
                                  setPairWith(0);
                                }}>
                                Pair…
                              </button>
                            )}
                          </td>
                        </tr>
                        {pairing === id && (
                          <tr className="border-b border-rule bg-paper-2">
                            <td colSpan={9} className="px-2 py-2">
                              {pairOptions.length ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span>Same bill as</span>
                                  <select className="field !w-auto min-w-0 max-w-full !py-1" aria-label="Bill to pair with" value={pairWith} onChange={(e) => setPairWith(Number(e.target.value))}>
                                    {pairOptions.slice(0, 300).map((o, i) => {
                                      const od = lineDoc(o);
                                      return (
                                        <option key={lineId(o)} value={i}>
                                          {`${od.no} · ${dayText(od.date)} · tax ${fmtAmt.format(taxOf(od))}${od.gstin !== d.gstin ? ` · ${od.gstin || 'import'}` : ''} (${o.b2 ? 'in 2B' : 'in books'})`}
                                        </option>
                                      );
                                    })}
                                  </select>
                                  <button
                                    type="button"
                                    className="btn !py-1"
                                    onClick={() => {
                                      const o = pairOptions[pairWith];
                                      if (!o) return;
                                      decide('pairs', l.b2 ? pairKey(l.b2, o.bk!) : pairKey(o.b2!, l.bk!), true);
                                      setPairing(null);
                                    }}
                                  >
                                    Pair them
                                  </button>
                                  <button type="button" className="underline" onClick={() => setPairing(null)}>
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <span className="text-ink-3">
                                  No unmatched {l.b2 ? 'bill in the books' : 'document in GSTR-2B'} from {d.gstin ? 'this supplier (or another GSTIN of its PAN)' : 'imports'} to pair with.{' '}
                                  <button type="button" className="underline" onClick={() => setPairing(null)}>
                                    Close
                                  </button>
                                </span>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {!shownLines.length && <p className="mt-2 text-[0.85rem] text-ink-3">Nothing matches the search or filters.</p>}
              {shownLines.length > limit && (
                <p className="mt-2 text-[0.85rem] text-ink-3">
                  The first {fmtInt.format(limit)} of {fmtInt.format(shownLines.length)} are shown; the Excel report has all of them.{' '}
                  <button type="button" className="underline" onClick={() => setLimit(limit + SHOWN)}>
                    Show {fmtInt.format(Math.min(SHOWN, shownLines.length - limit))} more
                  </button>
                </p>
              )}
            </div>
          )}

          {view === 'months' && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[0.85rem]">
                <thead>
                  <tr className="border-b border-ink text-left">
                    {['GSTR-2B month', 'ITC in GSTR-2B', 'ITC booked that month', 'Difference', 'Of the 2B ITC, booked in another month'].map((h) => (
                      <th key={h} className="label py-1.5 pr-3 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month} className="border-b border-rule">
                      <td className="py-1 pr-3">{monthText(m.month)}</td>
                      <td className="py-1 pr-3 text-right font-mono">{fmtAmt.format(m.tax2b)}</td>
                      <td className="py-1 pr-3 text-right font-mono">{fmtAmt.format(m.taxBooks)}</td>
                      <td className="py-1 pr-3 text-right font-mono" style={{ color: Math.abs(m.tax2b - m.taxBooks) > 0.005 ? 'var(--warn)' : undefined }}>
                        {fmtAmt.format(m.tax2b - m.taxBooks)}
                      </td>
                      <td className="py-1 pr-3 text-right font-mono">{m.otherMonth ? fmtAmt.format(m.otherMonth) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[0.85rem] text-ink-3">
                Booked that month: by the voucher date where your register has one, else the invoice date. Hold these against the ITC taken in each month&rsquo;s GSTR-3B; bills booked in one month but in another month&rsquo;s GSTR-2B are noted on the bill.
              </p>
            </div>
          )}

          {view === 'suppliers' && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-[0.85rem]">
                <thead>
                  <tr className="border-b border-ink text-left">
                    {['Supplier', 'Tax in 2B', 'Tax in books', 'Difference', 'Still open', ''].map((h) => (
                      <th key={h} className="label py-1.5 pr-3 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownSups.slice(0, 200).map((s) => {
                    const f = follow.get(s.gstin);
                    const openN = OPEN.reduce((n, k) => n + s.counts[k], 0);
                    return (
                      <tr key={s.gstin} className="border-b border-rule align-top">
                        <td className="py-1 pr-3">
                          <span className="block font-mono">{s.gstin || 'Imports'}</span>
                          <span className="block max-w-[18rem] truncate text-ink-3">{s.name}</span>
                        </td>
                        <td className="py-1 pr-3 text-right font-mono">{fmtAmt.format(s.tax2b)}</td>
                        <td className="py-1 pr-3 text-right font-mono">{fmtAmt.format(s.taxBooks)}</td>
                        <td className="py-1 pr-3 text-right font-mono" style={{ color: Math.abs(s.tax2b - s.taxBooks) > tolNum ? 'var(--warn)' : undefined }}>
                          {fmtAmt.format(s.tax2b - s.taxBooks)}
                        </td>
                        <td className="py-1 pr-3">{openN ? `${fmtInt.format(openN)} ${openN === 1 ? 'bill' : 'bills'}` : '—'}</td>
                        <td className="py-1 pr-1">
                          <button type="button" className="underline" onClick={() => filter(() => {
                              setSupplier(s.gstin);
                              setQuery('');
                              setShow('all');
                              setView('bills');
                            })}>
                            Bills
                          </button>
                          {f && (
                            <details className="mt-1">
                              <summary className="cursor-pointer underline">Message for {f.lines.length === 1 ? '1 bill' : `${f.lines.length} bills`}</summary>
                              <pre className="mt-1 max-w-[34rem] whitespace-pre-wrap border border-rule bg-card p-2 font-sans text-[0.82rem]">{f.text}</pre>
                              <button type="button" className="btn mt-1 !py-1" onClick={() => void copy(f.text, s.gstin)}>
                                {copied === s.gstin ? 'Copied' : 'Copy message'}
                              </button>
                            </details>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {shownSups.length > 200 && <p className="mt-2 text-[0.85rem] text-ink-3">The 200 suppliers with the largest difference are shown; search for others, or see the Excel report.</p>}
              {follow.size > 0 && <p className="mt-2 text-[0.85rem] text-ink-3">Suppliers with bills to take up have a message ready to send: bills in your books but not in GSTR-2B, and bills reported with less tax. The Excel report has them all on one sheet.</p>}
            </div>
          )}
        </Section>
      )}
      {twoB.length > 0 && read && !read.docs.length && !missing.length && <Notice tone="warn">No bills with a supplier GSTIN were found in the purchase register. Check the columns above.</Notice>}
    </div>
  );
}

