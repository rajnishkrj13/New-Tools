'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { zipStore } from '@editor/engines/PdfTools';
import { VOUCHER_TYPES, baseType, billCell, costCell, parseAmount, parseBills, parseCostCentres, round2, type Voucher } from '@/lib/tally/model';
import { vouchersXml, vouchersXmlByType } from '@/lib/tally/build';
import { validate, type Issue } from '@/lib/tally/validate';
import { TEMPLATES, TEMPLATE_CATEGORIES, fromTemplate, toTemplate, type Template } from '@/lib/tally/templates';
import { readTally } from '@/lib/tally/read';
import { XLSX_TYPE } from '@/lib/gst/excel';
import { useSaved } from './useSaved';
import { Bench, Notice, Spinner, download, type ToolProps } from './kit';
import { ImportSteps, IssueList, LedgerMasters, ProfileOptions, SectionTitle, SummaryGrid, XML_TYPE, money, readUpload, useProfile } from './tally/shared';

interface Line {
  ledger: string;
  dr: string;
  cr: string;
  cc: string;
  cat: string;
  bill: string;
}
export interface EditVoucher {
  id: number;
  date: string;
  type: string;
  number: string;
  reference: string;
  referenceDate: string;
  narration: string;
  lines: Line[];
}

export const DRAFT_KEY = 'tv:tally-draft';
export const DRAFT_ADD_KEY = 'tv:tally-draft-add';
const PAGE = 10;

const blankLine = (): Line => ({ ledger: '', dr: '', cr: '', cc: '', cat: '', bill: '' });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmt = (n: number) => (n ? String(round2(n)) : '');

export function toEdit(v: Voucher, id: number): EditVoucher {
  const base = baseType(v.type);
  return {
    id,
    date: v.date,
    type: v.type,
    number: v.number,
    reference: v.reference,
    referenceDate: v.referenceDate,
    narration: v.narration,
    lines: v.entries.map((e) => ({ ledger: e.ledger, dr: fmt(e.dr), cr: fmt(e.cr), cc: costCell(e), cat: e.costCentres.length ? e.costCategory : '', bill: billCell(e, base) })),
  };
}

/** Editor rows to vouchers, with problems in the cost centre and bill cells. */
function toVouchers(list: EditVoucher[]): { vouchers: Voucher[]; cellIssues: Issue[] } {
  const cellIssues: Issue[] = [];
  const vouchers = list.map((ev, i) => {
    const base = baseType(ev.type);
    return {
      date: ev.date,
      type: ev.type.trim(),
      number: ev.number.trim(),
      reference: ev.reference.trim(),
      referenceDate: ev.referenceDate,
      narration: ev.narration.trim(),
      entries: ev.lines
        .filter((l) => l.ledger.trim() || l.dr.trim() || l.cr.trim())
        .map((l, j) => {
          const dr = parseAmount(l.dr);
          const cr = parseAmount(l.cr);
          const amt = (Number.isNaN(dr) ? 0 : dr) || (Number.isNaN(cr) ? 0 : cr);
          const cc = parseCostCentres(l.cc, amt);
          const bills = parseBills(l.bill, amt, base);
          if (cc.error) cellIssues.push({ level: 'error', voucher: i, message: `Voucher ${ev.number || i + 1}, line ${j + 1}: ${cc.error}` });
          if (bills.error) cellIssues.push({ level: 'error', voucher: i, message: `Voucher ${ev.number || i + 1}, line ${j + 1}: ${bills.error}` });
          return { ledger: l.ledger.trim(), dr: Number.isNaN(dr) ? NaN : round2(dr), cr: Number.isNaN(cr) ? NaN : round2(cr), costCategory: l.cat.trim(), costCentres: cc.allocs, bills: bills.bills };
        }),
    } satisfies Voucher;
  });
  return { vouchers, cellIssues };
}

/** "JV-009" → "JV-010"; "" → "". */
function nextNumber(prev: string): string {
  const m = /^(.*?)(\d+)(\D*)$/.exec(prev);
  if (!m) return '';
  return `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}${m[3]}`;
}

export default function TallyJournalEntryExcel(props: ToolProps) {
  const prof = useProfile();
  const seq = useRef(1);
  const [list, setList] = useState<EditVoucher[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad' | 'warn'; text: string } | null>(null);
  const [tallyLedgers, setTallyLedgers] = useState<string[]>([]);
  const [tpl, setTpl] = useState(TEMPLATES[0].id);
  const [tplAmount, setTplAmount] = useState('10000');
  const [saving, setSaving] = useState<number | null>(null);
  const [saveName, setSaveName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const ledgerInput = useRef<HTMLInputElement>(null);
  const { value: mine, save: saveMine } = useSaved<Template[]>('tally-templates', [], { signedIn: props.signedIn, enabled: props.features.templates !== false });

  const newVoucher = (over: Partial<EditVoucher> = {}): EditVoucher => ({ id: seq.current++, date: today(), type: 'Journal', number: '', reference: '', referenceDate: '', narration: '', lines: [blankLine(), blankLine()], ...over });

  // The draft lives in this browser so a closed tab loses nothing; templates chosen elsewhere are added.
  useEffect(() => {
    let start: EditVoucher[] = [];
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) start = JSON.parse(raw) as EditVoucher[];
      const add = localStorage.getItem(DRAFT_ADD_KEY);
      if (add) {
        start = [...start, ...(JSON.parse(add) as Voucher[]).map((v) => toEdit(v, 0))];
        localStorage.removeItem(DRAFT_ADD_KEY);
      }
    } catch {
      /* storage blocked or old data: start fresh */
    }
    start = start.map((v, i) => ({ ...v, id: i + 1 }));
    seq.current = start.length + 1;
    setList(start.length ? start : [{ id: seq.current++, date: today(), type: 'Journal', number: 'JV-001', reference: '', referenceDate: '', narration: '', lines: [blankLine(), blankLine()] }]);
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(list));
      } catch {
        /* storage full or blocked */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [list, loaded]);

  const { vouchers, cellIssues } = useMemo(() => toVouchers(list), [list]);
  const check = useMemo(() => {
    const r = validate(vouchers, { company: prof.profile.company });
    const issues = [...cellIssues, ...r.issues];
    const bad = new Set([...r.bad, ...cellIssues.map((x) => x.voucher)]);
    return { ...r, issues, bad, summary: { ...r.summary, errors: issues.filter((x) => x.level === 'error').length, valid: vouchers.length - bad.size, invalid: bad.size } };
  }, [vouchers, cellIssues, prof.profile.company]);
  const valid = vouchers.filter((_, i) => !check.bad.has(i));

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.map((v, i) => ({ v, i })).filter(({ v }) => !s || `${v.number} ${v.type} ${v.narration} ${v.reference} ${v.lines.map((l) => l.ledger).join(' ')}`.toLowerCase().includes(s));
  }, [list, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice(Math.min(page, pages - 1) * PAGE, Math.min(page, pages - 1) * PAGE + PAGE);

  const ledgerOptions = useMemo(() => [...new Set([...tallyLedgers, ...list.flatMap((v) => v.lines.map((l) => l.ledger.trim()))].filter(Boolean))].sort((a, b) => a.localeCompare(b)), [tallyLedgers, list]);

  const set = (id: number, patch: Partial<EditVoucher>) => setList((cur) => cur.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const setLine = (id: number, j: number, patch: Partial<Line>) => setList((cur) => cur.map((v) => (v.id === id ? { ...v, lines: v.lines.map((l, k) => (k === j ? { ...l, ...patch } : l)) } : v)));
  const addVoucher = (v?: EditVoucher) => {
    const last = list[list.length - 1];
    const fresh = v ?? newVoucher({ date: last?.date ?? today(), type: last?.type ?? 'Journal', number: last ? nextNumber(last.number) : 'JV-001' });
    setList((cur) => [...cur, fresh]);
    setQ('');
    setPage(Math.floor(list.length / PAGE));
  };
  const allTemplates = [...mine, ...TEMPLATES];

  const onUpload = async (file: File, replace: boolean) => {
    setMsg(null);
    setBusy('Reading the file…');
    try {
      const up = await readUpload(file, ['sheet']);
      if (up.kind !== 'sheet') return;
      const { detectColumns, rowsToVouchers } = await import('@/lib/tally/sheet');
      const sheet = up.sheets.map((s) => ({ s, d: detectColumns(s.rows) })).find((x) => x.d.headerRow >= 0 && (x.d.mapping.debit >= 0 || x.d.mapping.credit >= 0 || x.d.mapping.amount >= 0));
      if (!sheet) throw new Error('No sheet with a Ledger column and Debit/Credit (or Amount) columns was found. Use the template, or the Excel to Tally XML Converter to match your own columns.');
      const { vouchers: read, problems } = rowsToVouchers(sheet.s.rows, sheet.d.mapping, { headerRow: sheet.d.headerRow, defaultType: 'Journal' });
      if (!read.length) throw new Error('The sheet has headers but no voucher rows.');
      const edits = read.map((v) => toEdit(v, seq.current++));
      setList((cur) => (replace ? edits : [...cur.filter((v) => v.lines.some((l) => l.ledger || l.dr || l.cr)), ...edits]));
      setPage(0);
      setMsg({ tone: problems.length ? 'warn' : 'ok', text: `Read ${read.length} vouchers from sheet "${sheet.s.name}".${problems.length ? ` ${problems.length} cells need attention: ${problems.slice(0, 3).map((p) => `row ${p.row}: ${p.message}`).join(' ')}` : ''}` });
    } catch (e) {
      setMsg({ tone: 'bad', text: (e as Error).message });
    } finally {
      setBusy('');
    }
  };

  const saveExcel = async () => {
    setBusy('Writing the Excel file…');
    try {
      const { vouchersWorkbook } = await import('@/lib/tally/sheet');
      download(await vouchersWorkbook(vouchers, { issues: check.issues, bad: check.bad }), 'tally-vouchers.xlsx', XLSX_TYPE);
    } finally {
      setBusy('');
    }
  };

  if (!loaded) return <Bench>Loading your draft…</Bench>;

  return (
    <div className="space-y-4">
      <Bench>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn" onClick={() => addVoucher()}>
            + Add voucher
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={async () => {
              const { templateWorkbook } = await import('@/lib/tally/sheet');
              download(await templateWorkbook(), 'tally-journal-template.xlsx', XLSX_TYPE);
            }}
          >
            Download Excel template
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => fileInput.current?.click()}>
            Upload Excel / CSV
          </button>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (props.maxMb && f.size > props.maxMb * 1048576) return setMsg({ tone: 'bad', text: `${f.name} is over the ${props.maxMb} MB limit.` });
              const empty = !list.some((v) => v.lines.some((l) => l.ledger || l.dr || l.cr));
              void onUpload(f, empty || window.confirm('Replace the vouchers on screen with the ones in the file? (Cancel adds them after the current ones.)'));
            }}
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (window.confirm('Remove all vouchers from the screen? (The draft saved in this browser is cleared too.)')) {
                setList([newVoucher({ number: 'JV-001' })]);
                setPage(0);
              }
            }}
          >
            Clear all
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => ledgerInput.current?.click()} title="An XML export of List of Accounts (or any Tally XML) from your Tally">
            Ledger names from a Tally export
          </button>
          <input
            ref={ledgerInput}
            type="file"
            hidden
            accept=".xml,text/xml,application/xml"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setBusy('Reading ledger names…');
              try {
                const up = await readUpload(f, ['xml']);
                if (up.kind !== 'xml' || !up.parsed.root) throw new Error('This file could not be read as XML.');
                const read = readTally(up.parsed.root);
                const names = [...new Set([...(read.masters.find((m) => m.kind === 'LEDGER')?.rows.map((r) => r.NAME) ?? []), ...read.vouchers.flatMap((v) => v.entries.map((x) => x.ledger))].filter(Boolean))];
                if (!names.length) throw new Error('No ledger names were found. Export "List of Accounts" from Tally as XML.');
                setTallyLedgers(names);
                setMsg({ tone: 'ok', text: `${names.length} ledger names from ${f.name} now appear as suggestions while you type.` });
              } catch (err) {
                setMsg({ tone: 'bad', text: (err as Error).message });
              } finally {
                setBusy('');
              }
            }}
          />
        </div>
        <div className="mt-4 grid items-end gap-2 border-t border-rule pt-4 sm:grid-cols-[1fr_9rem_auto]">
          <label className="block">
            <span className="label mb-1 block">Start from a template ({allTemplates.length})</span>
            <select className="field" value={tpl} onChange={(e) => setTpl(e.target.value)}>
              {mine.length > 0 && (
                <optgroup label="My templates">
                  {mine.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {TEMPLATE_CATEGORIES.map((c) => (
                <optgroup key={c} label={c}>
                  {TEMPLATES.filter((t) => t.category === c).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.type})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label mb-1 block">Base amount</span>
            <input className="field text-right font-mono" inputMode="decimal" value={tplAmount} onChange={(e) => setTplAmount(e.target.value)} />
          </label>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const t = allTemplates.find((x) => x.id === tpl);
              const amt = parseAmount(tplAmount);
              if (!t || !(amt > 0)) return setMsg({ tone: 'bad', text: 'Enter a base amount above zero.' });
              const last = list[list.length - 1];
              const v = fromTemplate(t, amt, last?.date ?? today(), last?.type === t.type ? nextNumber(last.number) : '');
              addVoucher(toEdit(v, seq.current++));
              setMsg({ tone: 'ok', text: `Added "${t.name}". Change the ledger names to the ones in your Tally and check the amounts.` });
            }}
          >
            Add from template
          </button>
        </div>
        <p className="mt-2 text-[0.8rem] text-ink-3">Templates are common examples, not accounting advice: check each entry against your facts and policies.</p>
        {busy && <Spinner text={busy} />}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </Bench>

      <div className="flex flex-wrap items-center gap-3">
        <input className="field !min-h-9 max-w-xs py-1 text-sm" placeholder="Find a voucher…" value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} aria-label="Find a voucher" />
        <span className="label">
          {list.length} voucher{list.length === 1 ? '' : 's'} · draft saved in this browser
        </span>
        {pages > 1 && (
          <span className="ml-auto flex items-center gap-2 text-sm">
            <button type="button" className="underline disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              ‹ Previous
            </button>
            Page {Math.min(page, pages - 1) + 1} of {pages}
            <button type="button" className="underline disabled:opacity-40" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
              Next ›
            </button>
          </span>
        )}
      </div>

      <datalist id="tally-ledgers">
        {ledgerOptions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="tally-vtypes">
        {VOUCHER_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {shown.map(({ v, i }) => {
        const vv = vouchers[i];
        const dr = round2(vv.entries.reduce((n, e) => n + (Number.isNaN(e.dr) ? 0 : e.dr), 0));
        const cr = round2(vv.entries.reduce((n, e) => n + (Number.isNaN(e.cr) ? 0 : e.cr), 0));
        const diff = round2(dr - cr);
        const errs = check.issues.filter((x) => x.voucher === i && x.level === 'error');
        return (
          <section key={v.id} className="border border-ink bg-card" aria-label={`Voucher ${v.number || i + 1}`}>
            <div className="grid gap-2 border-b border-rule bg-paper-2 p-3 sm:grid-cols-[9.5rem_9rem_8rem_1fr_9.5rem]">
              <label className="block">
                <span className="label mb-0.5 block">Date</span>
                <input type="date" className="field !min-h-9 py-1" value={v.date} onChange={(e) => set(v.id, { date: e.target.value })} />
              </label>
              <label className="block">
                <span className="label mb-0.5 block">Voucher type</span>
                <input className="field !min-h-9 py-1" list="tally-vtypes" value={v.type} onChange={(e) => set(v.id, { type: e.target.value })} />
              </label>
              <label className="block">
                <span className="label mb-0.5 block">Number</span>
                <input className="field !min-h-9 py-1 font-mono" value={v.number} onChange={(e) => set(v.id, { number: e.target.value })} />
              </label>
              <label className="block">
                <span className="label mb-0.5 block">Reference no.</span>
                <input className="field !min-h-9 py-1" value={v.reference} onChange={(e) => set(v.id, { reference: e.target.value })} />
              </label>
              <label className="block">
                <span className="label mb-0.5 block">Reference date</span>
                <input type="date" className="field !min-h-9 py-1" value={v.referenceDate} onChange={(e) => set(v.id, { referenceDate: e.target.value })} />
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-[0.9rem]">
                <thead>
                  <tr className="text-left">
                    <th className="label px-3 pt-2 font-normal">Ledger name</th>
                    <th className="label px-1 pt-2 text-right font-normal">Debit</th>
                    <th className="label px-1 pt-2 text-right font-normal">Credit</th>
                    <th className="label px-1 pt-2 font-normal">Cost centre (split: “HO: 600; Branch: 400”)</th>
                    <th className="label px-1 pt-2 font-normal">Cost category</th>
                    <th className="label px-1 pt-2 font-normal">Bill-wise ref</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {v.lines.map((l, j) => (
                    <tr key={j}>
                      <td className="px-3 py-1">
                        <input className="field !min-h-9 py-1" list="tally-ledgers" value={l.ledger} placeholder={j === 0 ? 'Debit ledger' : j === 1 ? 'Credit ledger' : 'Ledger'} onChange={(e) => setLine(v.id, j, { ledger: e.target.value })} aria-label={`Ledger, line ${j + 1}`} />
                      </td>
                      <td className="w-32 px-1">
                        <input className="field !min-h-9 py-1 text-right font-mono" inputMode="decimal" value={l.dr} onChange={(e) => setLine(v.id, j, { dr: e.target.value, ...(e.target.value ? { cr: '' } : {}) })} aria-label={`Debit, line ${j + 1}`} />
                      </td>
                      <td className="w-32 px-1">
                        <input className="field !min-h-9 py-1 text-right font-mono" inputMode="decimal" value={l.cr} onChange={(e) => setLine(v.id, j, { cr: e.target.value, ...(e.target.value ? { dr: '' } : {}) })} aria-label={`Credit, line ${j + 1}`} />
                      </td>
                      <td className="px-1">
                        <input className="field !min-h-9 py-1" value={l.cc} onChange={(e) => setLine(v.id, j, { cc: e.target.value })} aria-label={`Cost centre, line ${j + 1}`} />
                      </td>
                      <td className="w-40 px-1">
                        <input className="field !min-h-9 py-1" value={l.cat} placeholder={l.cc ? 'Primary Cost Category' : ''} onChange={(e) => setLine(v.id, j, { cat: e.target.value })} aria-label={`Cost category, line ${j + 1}`} />
                      </td>
                      <td className="w-44 px-1">
                        <input className="field !min-h-9 py-1" value={l.bill} placeholder="INV-101" onChange={(e) => setLine(v.id, j, { bill: e.target.value })} aria-label={`Bill reference, line ${j + 1}`} />
                      </td>
                      <td className="pr-2 text-center">
                        <button type="button" className="text-ink-3 hover:text-bad" aria-label={`Remove line ${j + 1}`} onClick={() => set(v.id, { lines: v.lines.length > 1 ? v.lines.filter((_, k) => k !== j) : [blankLine()] })}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="px-3 py-1.5">
                      <button type="button" className="text-sm underline" onClick={() => set(v.id, { lines: [...v.lines, blankLine()] })}>
                        + Add line
                      </button>
                      {diff !== 0 && (
                        <button
                          type="button"
                          className="ml-4 text-sm underline"
                          onClick={() => {
                            const k = v.lines.findIndex((x) => !x.dr && !x.cr);
                            const patch = diff > 0 ? { cr: String(Math.abs(diff)), dr: '' } : { dr: String(Math.abs(diff)), cr: '' };
                            if (k >= 0) setLine(v.id, k, patch);
                            else set(v.id, { lines: [...v.lines, { ...blankLine(), ...patch }] });
                          }}
                        >
                          Balance it ({money(Math.abs(diff))} {diff > 0 ? 'Cr' : 'Dr'})
                        </button>
                      )}
                    </td>
                    <td className="px-1 text-right font-mono tabular-nums">{money(dr)}</td>
                    <td className="px-1 text-right font-mono tabular-nums" style={{ color: diff ? 'var(--bad)' : undefined }}>
                      {money(cr)}
                    </td>
                    <td colSpan={4} className="px-1 text-sm" style={{ color: diff ? 'var(--bad)' : 'var(--ok)' }}>
                      {diff ? `Difference ${money(Math.abs(diff))}` : dr ? 'Balanced' : ''}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="grid gap-2 border-t border-rule p-3 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="label mb-0.5 block">Narration</span>
                <textarea className="field min-h-[2.5rem] py-1.5" rows={1} value={v.narration} onChange={(e) => set(v.id, { narration: e.target.value })} />
              </label>
              <div className="flex flex-wrap items-end gap-3 text-sm">
                <button type="button" className="underline" onClick={() => setList((cur) => [...cur.slice(0, i + 1), { ...v, id: seq.current++, number: nextNumber(v.number) || v.number, lines: v.lines.map((l) => ({ ...l })) }, ...cur.slice(i + 1)])}>
                  Duplicate
                </button>
                <button type="button" className="underline" onClick={() => (setSaving(v.id), setSaveName(v.narration.replace(/^being\s+/i, '').slice(0, 50)))}>
                  Save as template
                </button>
                <button type="button" className="underline hover:text-bad" onClick={() => setList((cur) => (cur.length > 1 ? cur.filter((x) => x.id !== v.id) : [newVoucher({ number: 'JV-001' })]))}>
                  Delete
                </button>
              </div>
            </div>
            {saving === v.id && (
              <div className="flex flex-wrap items-end gap-2 border-t border-rule p-3">
                <label className="block flex-1">
                  <span className="label mb-0.5 block">Template name</span>
                  <input className="field !min-h-9 py-1" value={saveName} onChange={(e) => setSaveName(e.target.value)} autoFocus />
                </label>
                <button
                  type="button"
                  className="btn !min-h-9"
                  disabled={!saveName.trim() || !vv.entries.length}
                  onClick={async () => {
                    const t = toTemplate(vv, saveName.trim());
                    await saveMine([t, ...mine.filter((x) => x.id !== t.id)].slice(0, 200));
                    setSaving(null);
                    setTpl(t.id);
                    setMsg({ tone: 'ok', text: `Saved "${t.name}" to your templates${props.signedIn ? ' (on your account)' : ' (in this browser)'}.` });
                  }}
                >
                  Save
                </button>
                <button type="button" className="btn btn-ghost !min-h-9" onClick={() => setSaving(null)}>
                  Cancel
                </button>
              </div>
            )}
            {errs.length > 0 && (
              <ul className="border-t border-rule px-3 py-2 text-[0.85rem]" style={{ color: 'var(--bad)' }}>
                {errs.slice(0, 4).map((x, k) => (
                  <li key={k}>{x.message}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {filtered.length === 0 && <Notice tone="info">No voucher matches “{q}”.</Notice>}
      <button type="button" className="btn btn-ghost w-full" onClick={() => addVoucher()}>
        + Add another voucher
      </button>

      <Bench>
        <SectionTitle n={1}>Check</SectionTitle>
        <div className="mt-3">
          <SummaryGrid s={check.summary} />
        </div>
        <IssueList issues={check.issues} vouchers={vouchers} />

        <SectionTitle n={2}>Download</SectionTitle>
        <div className="mt-3">
          <ProfileOptions p={prof} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn" disabled={!valid.length} onClick={() => download(new TextEncoder().encode(vouchersXml(valid, prof.profile)), 'tally-vouchers.xml', XML_TYPE)}>
            Download Tally XML ({valid.length})
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={new Set(valid.map((v) => v.type)).size < 2}
            onClick={() => {
              const files = vouchersXmlByType(valid, prof.profile).map((f) => ({ name: `tally-${f.type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xml`, bytes: new TextEncoder().encode(f.xml) }));
              download(zipStore(files), 'tally-vouchers-by-type.zip', 'application/zip');
            }}
          >
            One XML per voucher type (ZIP)
          </button>
          <button type="button" className="btn btn-ghost" disabled={!vouchers.length} onClick={() => void saveExcel()}>
            Download Excel
          </button>
        </div>
        {check.bad.size > 0 && valid.length > 0 && <Notice tone="warn">{check.bad.size} voucher{check.bad.size === 1 ? ' has' : 's have'} errors and {check.bad.size === 1 ? 'is' : 'are'} left out of the XML until fixed. The Excel file keeps everything.</Notice>}
        <p className="mt-2 text-[0.8rem] text-ink-3">In Tally: Gateway of Tally → Import → Transactions (TallyPrime) or Import of Data → Vouchers (Tally.ERP 9), and choose the downloaded XML.</p>

        <LedgerMasters vouchers={valid} company={prof.profile.company} />
        <ImportSteps />
      </Bench>
    </div>
  );
}
