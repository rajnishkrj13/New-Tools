'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { TALLY_GROUPS, guessGroup, ledgersXml, profileFor, type TallyMode, type XmlProfile } from '@/lib/tally/build';
import { decodeXml, parseXml, type Parsed } from '@/lib/tally/xml';
import { readTally } from '@/lib/tally/read';
import { showDate, totals, type Voucher } from '@/lib/tally/model';
import { voucherKey, type CheckOptions, type Issue, type Summary } from '@/lib/tally/validate';
import { Notice, download, useCopy } from '../kit';

export const XML_TYPE = 'application/xml';
export const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---- Files ------------------------------------------------------------------------------------

export type Upload =
  | { kind: 'xml'; name: string; text: string; parsed: Parsed }
  | { kind: 'sheet'; name: string; sheets: { name: string; rows: unknown[][] }[] };

/** Reads an upload by what it really is (not just its extension): XML, Excel (XLSX/XLS) or CSV. */
export async function readUpload(file: File, accept: ('xml' | 'sheet')[]): Promise<Upload> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  const text = zip || ole ? '' : decodeXml(bytes.subarray(0, 4096));
  const looksXml = !zip && !ole && /^\s*</.test(text);
  if (looksXml) {
    if (!accept.includes('xml')) throw new Error(`${file.name} is an XML file. Use the Excel to Tally XML converter's XML option, or the Tally XML tools.`);
    const full = decodeXml(bytes);
    return { kind: 'xml', name: file.name, text: full, parsed: parseXml(full) };
  }
  if (!accept.includes('sheet')) throw new Error(`${file.name} is not an XML file.`);
  const isCsv = !zip && !ole;
  if (isCsv && /[\u0000-\u0008]/.test(text)) throw new Error(`${file.name} is not an Excel, CSV or XML file.`);
  const XLSX = await import('xlsx');
  const wb = isCsv ? XLSX.read(decodeXml(bytes), { type: 'string', raw: true }) : XLSX.read(bytes, { type: 'array', cellDates: true });
  const sheets = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: true }) }));
  if (!sheets.some((s) => s.rows.length)) throw new Error(`${file.name} has no rows.`);
  return { kind: 'sheet', name: file.name, sheets };
}


// ---- Comparing with data exported from Tally ------------------------------------------------------

export interface Reference {
  name: string;
  /** What the export held, in words. */
  kind: string;
  opts: CheckOptions;
  ledgerCount: number;
  voucherCount: number;
}

/**
 * An XML file exported from Tally (List of Accounts / masters, or the Day Book) to check vouchers
 * against: ledgers that do not exist, voucher types, and vouchers already entered.
 */
export async function readReference(file: File): Promise<Reference> {
  const up = await readUpload(file, ['xml']);
  if (up.kind !== 'xml' || !up.parsed.root) throw new Error('This file could not be read as XML.');
  const read = readTally(up.parsed.root);
  const ledgerRows = read.masters.find((m) => m.kind === 'LEDGER')?.rows ?? [];
  const typeRows = read.masters.find((m) => m.kind === 'VOUCHERTYPE')?.rows ?? [];
  if (!ledgerRows.length && !read.vouchers.length) throw new Error('This export has no ledgers and no vouchers. Export "List of Accounts" (masters) or the Day Book from Tally as XML.');
  const opts: CheckOptions = {};
  if (ledgerRows.length) opts.ledgers = new Set(ledgerRows.map((r) => r.NAME.toLowerCase()).filter(Boolean));
  if (typeRows.length) opts.types = new Map(typeRows.map((r) => [r.NAME.toLowerCase(), r.PARENT || r.NAME]));
  if (read.vouchers.length) opts.existing = new Set(read.vouchers.map(voucherKey));
  return { name: up.name, kind: read.kind, opts, ledgerCount: ledgerRows.length, voucherCount: read.vouchers.length };
}

/** Upload a Tally export to compare with; shows what it holds. */
export function ReferencePanel({ value, onChange }: { value: Reference | null; onChange: (r: Reference | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3 border border-rule bg-paper px-3 py-2.5 text-[0.92rem]">
      {value ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            Comparing with <b>{value.name}</b>: {value.ledgerCount ? `${value.ledgerCount} ledgers` : 'no ledger list'}
            {value.voucherCount ? `, ${value.voucherCount} vouchers already in Tally` : ''}.
          </span>
          <button type="button" className="text-sm underline" onClick={() => onChange(null)}>
            Remove
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Optional: find missing ledgers and vouchers already entered by adding an XML export from Tally (List of Accounts or Day Book).</span>
          <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={() => input.current?.click()}>
            Add Tally export
          </button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept=".xml,text/xml,application/xml"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setError(null);
          try {
            onChange(await readReference(f));
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      />
      {error && <Notice tone="bad">{error}</Notice>}
      {!value && (
        <p className="mt-1 text-[0.8rem] text-ink-3">
          In TallyPrime: Display More Reports → List of Accounts (or Day Book) → Alt+E Export → Format: XML. In Tally.ERP 9: the same report → Alt+E.
        </p>
      )}
    </div>
  );
}

/** Ledger masters XML for ledgers the vouchers use, each with a group, to import before the vouchers. */
export function LedgerMasters({ vouchers, known, company }: { vouchers: Voucher[]; known?: Set<string>; company: string }) {
  const names = [...new Set(vouchers.flatMap((v) => v.entries.map((e) => e.ledger.trim())).filter((n) => n && !known?.has(n.toLowerCase())))].sort((a, b) => a.localeCompare(b));
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(!!known);
  if (!names.length) return known ? <Notice tone="ok">Every ledger used is in the Tally export.</Notice> : null;
  const list = names.map((n) => {
    const group = groups[n] ?? guessGroup(n);
    return { name: n, group, costCentres: true, billWise: /debtors|creditors/i.test(group) };
  });
  return (
    <div className="mt-3 border border-rule p-3">
      <p className="font-semibold">{known ? `${names.length} ledger${names.length === 1 ? ' is' : 's are'} not in the Tally export` : `Ledgers used: ${names.length}`}</p>
      <p className="mt-1 text-sm text-ink-2">
        {known ? 'Correct the names in your file if Tally spells them differently, or create them: choose a group for each and import the ledgers XML first (Import → Masters).' : 'If some ledgers do not exist in Tally yet, make them with a ledgers XML and import it before the vouchers (Import → Masters).'}
      </p>
      {!open ? (
        <button type="button" className="mt-2 text-sm underline" onClick={() => setOpen(true)}>
          Choose groups and make a ledgers XML
        </button>
      ) : (
        <>
          <div className="mt-2 max-h-64 overflow-y-auto">
            {list.map((l) => (
              <div key={l.name} className="grid grid-cols-[1fr_14rem] items-center gap-2 border-b border-rule py-1 text-sm">
                <span className="truncate" title={l.name}>
                  {l.name}
                </span>
                <select className="field !min-h-8 py-0.5 text-sm" value={l.group} onChange={(e) => setGroups({ ...groups, [l.name]: e.target.value })} aria-label={`Group for ${l.name}`}>
                  {TALLY_GROUPS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost mt-3" onClick={() => download(new TextEncoder().encode(ledgersXml(list, company)), 'tally-ledgers.xml', XML_TYPE)}>
            Download ledgers XML ({list.length})
          </button>
        </>
      )}
    </div>
  );
}

// ---- Output profile ------------------------------------------------------------------------------

export function useProfile() {
  const [mode, setMode] = useState<TallyMode>('prime');
  const [company, setCompany] = useState('');
  const [custom, setCustom] = useState<Partial<XmlProfile>>({ entriesTag: 'ALLLEDGERENTRIES.LIST', views: true, effectiveDate: true, party: true });
  const profile = useMemo(() => profileFor(mode, company.trim(), custom), [mode, company, custom]);
  return { mode, setMode, company, setCompany, custom, setCustom, profile };
}
export type ProfileState = ReturnType<typeof useProfile>;

export function ProfileOptions({ p }: { p: ProfileState }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="label mb-1 block">Tally version</span>
        <select className="field" value={p.mode} onChange={(e) => p.setMode(e.target.value as TallyMode)}>
          <option value="prime">TallyPrime (1.x to 7.x)</option>
          <option value="erp9">Tally.ERP 9</option>
          <option value="custom">Custom XML settings</option>
        </select>
      </label>
      <label className="block">
        <span className="label mb-1 block">Company name (optional)</span>
        <input className="field" placeholder="Blank: the company open in Tally" value={p.company} onChange={(e) => p.setCompany(e.target.value)} />
      </label>
      {p.mode === 'custom' && (
        <div className="grid gap-2 border border-rule p-3 text-[0.9rem] sm:col-span-2 sm:grid-cols-2">
          <label className="block">
            <span className="label mb-1 block">Ledger lines tag</span>
            <select className="field" value={p.custom.entriesTag} onChange={(e) => p.setCustom({ ...p.custom, entriesTag: e.target.value as XmlProfile['entriesTag'] })}>
              <option>ALLLEDGERENTRIES.LIST</option>
              <option>LEDGERENTRIES.LIST</option>
            </select>
          </label>
          {(
            [
              ['views', 'Voucher view tags (OBJVIEW, PERSISTEDVIEW)'],
              ['effectiveDate', 'Effective date'],
              ['party', 'Mark the party ledger'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" checked={!!p.custom[k]} onChange={(e) => p.setCustom({ ...p.custom, [k]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** How to bring a downloaded XML into Tally. */
export function ImportSteps() {
  return (
    <div className="mt-3 border-l-[3px] border-rule bg-paper px-3 py-2 text-[0.9rem]">
      <p className="font-semibold">Importing the XML in Tally</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ink-2">
        <li>Take a backup of the company (Alt+Y in TallyPrime).</li>
        <li>If you made a ledgers XML, import it first: Gateway of Tally → Import → Masters.</li>
        <li>TallyPrime: Gateway of Tally → Import → Transactions. Tally.ERP 9: Import of Data → Vouchers.</li>
        <li>Enter the path of the XML file, keep &ldquo;Behaviour of import&rdquo; as Combine/Add, and press Enter.</li>
        <li>Tally shows how many vouchers it created and lists any errors in Tally.imp in the Tally folder.</li>
      </ol>
    </div>
  );
}


// ---- Results -----------------------------------------------------------------------------------

export function SummaryGrid({ s }: { s: Summary }) {
  const cells: [string, string, string?][] = [
    ['Vouchers', String(s.vouchers)],
    ['Ledger lines', String(s.entries)],
    ['Total debit', money(s.debit)],
    ['Total credit', money(s.credit)],
    ['Valid', String(s.valid), s.valid ? 'var(--ok)' : undefined],
    ['With errors', String(s.invalid), s.invalid ? 'var(--bad)' : undefined],
    ['Warnings', String(s.warnings), s.warnings ? 'var(--warn)' : undefined],
  ];
  return (
    <dl className="grid grid-cols-2 border-l border-t border-rule sm:grid-cols-4 lg:grid-cols-7">
      {cells.map(([k, v, c]) => (
        <div key={k} className="border-b border-r border-rule px-3 py-2">
          <dt className="label">{k}</dt>
          <dd className="font-mono text-[1.05rem] tabular-nums" style={{ color: c }}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function IssueList({ issues, vouchers, atLabel = 'Row' }: { issues: Issue[]; vouchers: Voucher[]; atLabel?: string }) {
  const [show, setShow] = useState<'all' | 'error' | 'warning'>('all');
  const [limit, setLimit] = useState(100);
  const list = issues.filter((x) => show === 'all' || x.level === show);
  if (!issues.length) return <Notice tone="ok">No problems found: every voucher balances and has what Tally needs.</Notice>;
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2 text-sm">
        {(['all', 'error', 'warning'] as const).map((k) => (
          <button key={k} type="button" className={`border px-2.5 py-1 ${show === k ? 'border-ink bg-ink text-paper' : 'border-rule'}`} onClick={() => setShow(k)}>
            {k === 'all' ? `All (${issues.length})` : k === 'error' ? `Errors (${issues.filter((x) => x.level === 'error').length})` : `Warnings (${issues.filter((x) => x.level === 'warning').length})`}
          </button>
        ))}
      </div>
      <ul className="mt-2 max-h-[22rem] divide-y divide-rule overflow-y-auto border border-rule text-[0.9rem]">
        {list.slice(0, limit).map((x, i) => (
          <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-2 px-3 py-1.5">
            <span className="label" style={{ color: x.level === 'error' ? 'var(--bad)' : 'var(--warn)' }}>
              {x.level}
            </span>
            <span>
              {x.message}
              {x.at ? <span className="text-ink-3"> · {atLabel} {x.at}</span> : null}
              {x.voucher >= 0 && vouchers[x.voucher] && !x.message.includes(vouchers[x.voucher].number || '\u0000') ? <span className="text-ink-3"> · {vouchers[x.voucher].type}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {list.length > limit && (
        <button type="button" className="mt-2 text-sm underline" onClick={() => setLimit((n) => n + 200)}>
          Show more ({list.length - limit} left)
        </button>
      )}
    </div>
  );
}

/** Vouchers as a table, each expandable to its ledger lines; optional ticks for choosing some. */
export function VoucherTable({ vouchers, bad, selected, onSelect, note }: { vouchers: Voucher[]; bad?: Set<number>; selected?: Set<number>; onSelect?: (s: Set<number>) => void; note?: (i: number) => ReactNode }) {
  const [open, setOpen] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return vouchers.map((v, i) => ({ v, i })).filter(({ v }) => !s || `${v.number} ${v.type} ${v.narration} ${v.reference} ${v.date} ${v.entries.map((e) => e.ledger).join(' ')}`.toLowerCase().includes(s));
  }, [vouchers, q]);
  const toggle = (i: number) => {
    if (!selected || !onSelect) return;
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    onSelect(next);
  };
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="field !min-h-9 max-w-xs py-1 text-sm" placeholder="Search number, ledger, narration…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search vouchers" />
        {selected && onSelect && (
          <>
            <button type="button" className="text-sm underline" onClick={() => onSelect(new Set(rows.filter(({ i }) => !bad?.has(i)).map(({ i }) => i)))}>
              Tick all valid{q ? ' shown' : ''}
            </button>
            <button type="button" className="text-sm underline" onClick={() => onSelect(new Set())}>
              Untick all
            </button>
            <span className="label">{selected.size} ticked</span>
          </>
        )}
      </div>
      <div className="mt-2 max-h-[30rem] overflow-auto border border-rule">
        <table className="w-full min-w-[640px] border-collapse text-[0.88rem]">
          <thead className="sticky top-0 bg-paper-2 text-left">
            <tr>
              {selected && <th className="w-8 px-2 py-1.5" />}
              <th className="px-2 py-1.5">Date</th>
              <th className="px-2">Type</th>
              <th className="px-2">Number</th>
              <th className="px-2">Lines</th>
              <th className="px-2 text-right">Debit</th>
              <th className="px-2 text-right">Credit</th>
              <th className="px-2">Narration</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map(({ v, i }) => {
              const t = totals(v);
              return (
                <FragmentRow key={i}>
                  <tr className={`cursor-pointer border-t border-rule hover:bg-paper-2 ${bad?.has(i) ? 'bg-[color-mix(in_srgb,var(--bad)_8%,transparent)]' : ''}`} onClick={() => setOpen(open === i ? null : i)}>
                    {selected && (
                      <td className="px-2" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Choose voucher ${v.number || i + 1}`} checked={selected.has(i)} onChange={() => toggle(i)} />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono">{showDate(v.date)}</td>
                    <td className="px-2">{v.type}</td>
                    <td className="px-2 font-mono">{v.number || '—'}</td>
                    <td className="px-2">{v.entries.length}</td>
                    <td className="px-2 text-right font-mono tabular-nums">{money(t.dr)}</td>
                    <td className="px-2 text-right font-mono tabular-nums" style={{ color: Math.abs(t.dr - t.cr) > 0.005 ? 'var(--bad)' : undefined }}>
                      {money(t.cr)}
                    </td>
                    <td className="max-w-[18rem] truncate px-2 text-ink-2">
                      {note?.(i)}
                      {v.narration}
                    </td>
                  </tr>
                  {open === i && (
                    <tr className="bg-paper">
                      <td colSpan={selected ? 8 : 7} className="px-3 py-2">
                        <table className="w-full text-[0.85rem]">
                          <tbody>
                            {v.entries.map((e, j) => (
                              <tr key={j}>
                                <td className="py-0.5 pr-3">{e.dr ? 'Dr' : 'Cr'}</td>
                                <td className="pr-3">{e.ledger || <i className="text-bad">no ledger</i>}</td>
                                <td className="pr-3 text-right font-mono">{e.dr ? money(e.dr) : ''}</td>
                                <td className="pr-3 text-right font-mono">{e.cr ? money(e.cr) : ''}</td>
                                <td className="text-ink-3">
                                  {[e.costCentres.map((c) => `${c.centre} ${money(c.amount)}`).join(', '), e.bills.map((b) => `${b.type} ${b.name}`).join(', ')].filter(Boolean).join(' · ')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {(v.reference || v.referenceDate) && (
                          <p className="mt-1 text-ink-3">
                            Ref: {v.reference} {v.referenceDate ? showDate(v.referenceDate) : ''}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" className="mt-2 text-sm underline" onClick={() => setLimit((n) => n + 300)}>
          Show more ({rows.length - limit} left)
        </button>
      )}
    </div>
  );
}

function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function XmlPreview({ xml, max = 30000 }: { xml: string; max?: number }) {
  const { copied, copy } = useCopy();
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <span className="label">
          XML preview{xml.length > max ? ` (first ${Math.round(max / 1000)} KB of ${Math.round(xml.length / 1024)} KB)` : ''}
        </span>
        <button type="button" className="text-sm underline" onClick={() => void copy(xml)}>
          {copied ? 'Copied' : 'Copy XML'}
        </button>
      </div>
      <pre className="mt-1 max-h-[24rem] overflow-auto border border-rule bg-paper p-3 font-mono text-[0.78rem] leading-snug">{xml.slice(0, max)}</pre>
    </div>
  );
}

export function SectionTitle({ n, children }: { n?: number; children: ReactNode }) {
  return (
    <h3 className="mt-6 flex items-baseline gap-2 text-[1.05rem] font-semibold first:mt-0">
      {n ? <span className="label text-signal">{String(n).padStart(2, '0')}</span> : null}
      {children}
    </h3>
  );
}

/** The first rows of a table of named values. */
export function PreviewTable({ rows }: { rows: Record<string, string>[] }) {
  const cols = [...new Set(rows.slice(0, 200).flatMap((r) => Object.keys(r)))].slice(0, 8);
  return (
    <div className="mt-2 max-h-80 overflow-auto border border-rule">
      <table className="w-full border-collapse text-[0.82rem]">
        <thead className="sticky top-0 bg-paper-2">
          <tr>
            {cols.map((c) => (
              <th key={c} className="whitespace-nowrap px-2 py-1 text-left">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 200).map((r, i) => (
            <tr key={i} className="border-t border-rule">
              {cols.map((c) => (
                <td key={c} className="max-w-[16rem] truncate whitespace-nowrap px-2 py-1">
                  {r[c] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 200 && <p className="px-2 py-1 text-xs text-ink-3">First 200 of {rows.length} rows shown; the Excel file has all of them.</p>}
    </div>
  );
}
