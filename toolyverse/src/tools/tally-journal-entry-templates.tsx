'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { TEMPLATES, TEMPLATE_CATEGORIES, fromTemplate, type Template, type TemplateLine } from '@/lib/tally/templates';
import { VOUCHER_TYPES, parseAmount, round2 } from '@/lib/tally/model';
import { profileFor, vouchersXml } from '@/lib/tally/build';
import { XLSX_TYPE } from '@/lib/gst/excel';
import { useSaved } from './useSaved';
import { Bench, Notice, download, type ToolProps } from './kit';
import { XML_TYPE, money } from './tally/shared';

const DRAFT_ADD_KEY = 'tv:tally-draft-add';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const blank = (): Template => ({ id: '', category: 'My templates', name: '', type: 'Journal', narration: '', custom: true, lines: [{ ledger: '', side: 'Dr', pct: 100 }, { ledger: '', side: 'Cr', pct: 100 }] });

export default function TallyJournalEntryTemplates(props: ToolProps) {
  const router = useRouter();
  const { value: mine, save: saveMine } = useSaved<Template[]>('tally-templates', [], { signedIn: props.signedIn });
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>(props.preset?.category ?? 'all');
  const [amount, setAmount] = useState('10000');
  const [date, setDate] = useState(today());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Template | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const all = useMemo(() => [...mine, ...TEMPLATES], [mine]);
  const base = parseAmount(amount);
  const list = all.filter((t) => (cat === 'all' || (cat === 'mine' ? t.custom : t.category === cat)) && (!q.trim() || `${t.name} ${t.type} ${t.lines.map((l) => l.ledger).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())));
  const vouchersOf = (ts: Template[]) => ts.map((t) => fromTemplate(t, base > 0 ? base : 10000, date));

  const toCreator = (ts: Template[]) => {
    try {
      const cur = JSON.parse(localStorage.getItem(DRAFT_ADD_KEY) ?? '[]') as unknown[];
      localStorage.setItem(DRAFT_ADD_KEY, JSON.stringify([...cur, ...vouchersOf(ts)]));
      router.push('/tally-journal-entry-excel');
    } catch {
      setMsg('This browser blocks saving data for the page; download the Excel file instead and upload it in the Journal Entry Creator.');
    }
  };

  const saveEdit = async () => {
    if (!edit) return;
    const t: Template = { ...edit, id: edit.id || `my-${Date.now().toString(36)}`, custom: true, lines: edit.lines.filter((l) => l.ledger.trim()) };
    await saveMine([t, ...mine.filter((x) => x.id !== t.id)].slice(0, 200));
    setEdit(null);
    setMsg(`Saved "${t.name}"${props.signedIn ? ' to your account' : ' in this browser'}.`);
    setCat('mine');
  };

  return (
    <div className="space-y-4">
      <Bench>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem_9rem_10rem]">
          <label className="block">
            <span className="label mb-1 block">Search templates</span>
            <input className="field" placeholder="rent, GST, TDS, EMI, depreciation…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="block">
            <span className="label mb-1 block">Category</span>
            <select className="field" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">All ({all.length})</option>
              <option value="mine">My templates ({mine.length})</option>
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c} ({TEMPLATES.filter((t) => t.category === c).length})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label mb-1 block">Base amount</span>
            <input className="field text-right font-mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="block">
            <span className="label mb-1 block">Date</span>
            <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setEdit(blank())}>
            + New template
          </button>
          {picked.size > 0 && (
            <>
              <span className="label">{picked.size} chosen</span>
              <button type="button" className="btn" onClick={() => toCreator(all.filter((t) => picked.has(t.id)))}>
                Open in Journal Entry Creator
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={async () => {
                  const { vouchersWorkbook } = await import('@/lib/tally/sheet');
                  download(await vouchersWorkbook(vouchersOf(all.filter((t) => picked.has(t.id)))), 'tally-template-entries.xlsx', XLSX_TYPE);
                }}
              >
                Excel
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => download(new TextEncoder().encode(vouchersXml(vouchersOf(all.filter((t) => picked.has(t.id))), profileFor('prime'))), 'tally-template-entries.xml', XML_TYPE)}>
                Tally XML
              </button>
              <button type="button" className="text-sm underline" onClick={() => setPicked(new Set())}>
                Clear choice
              </button>
            </>
          )}
        </div>
        {msg && <Notice tone="ok">{msg}</Notice>}
        <p className="mt-2 text-[0.8rem] text-ink-3">Amounts are shares of the base amount (for example 18% GST on 100). These are common examples, not accounting advice: change ledger names to your own and check each entry.</p>
      </Bench>

      {edit && (
        <Bench>
          <p className="font-semibold">{edit.id ? 'Edit template' : 'New template'}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_12rem]">
            <label className="block">
              <span className="label mb-1 block">Name</span>
              <input className="field" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus />
            </label>
            <label className="block">
              <span className="label mb-1 block">Voucher type</span>
              <input className="field" list="tpl-vtypes" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })} />
              <datalist id="tpl-vtypes">
                {VOUCHER_TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="block sm:col-span-2">
              <span className="label mb-1 block">Narration</span>
              <input className="field" value={edit.narration} onChange={(e) => setEdit({ ...edit, narration: e.target.value })} />
            </label>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="label font-normal">Dr / Cr</th>
                <th className="label font-normal">Ledger</th>
                <th className="label text-right font-normal">% of base</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {edit.lines.map((l, i) => {
                const upd = (p: Partial<TemplateLine>) => setEdit({ ...edit, lines: edit.lines.map((x, k) => (k === i ? { ...x, ...p } : x)) });
                return (
                  <tr key={i}>
                    <td className="w-24 py-1 pr-2">
                      <select className="field !min-h-9 py-1" value={l.side} onChange={(e) => upd({ side: e.target.value as 'Dr' | 'Cr' })}>
                        <option>Dr</option>
                        <option>Cr</option>
                      </select>
                    </td>
                    <td className="pr-2">
                      <input className="field !min-h-9 py-1" value={l.ledger} onChange={(e) => upd({ ledger: e.target.value })} aria-label={`Ledger ${i + 1}`} />
                    </td>
                    <td className="w-28 pr-2">
                      <input className="field !min-h-9 py-1 text-right font-mono" inputMode="decimal" value={l.pct} onChange={(e) => upd({ pct: parseAmount(e.target.value) || 0 })} aria-label={`Percent ${i + 1}`} />
                    </td>
                    <td className="w-8">
                      <button type="button" aria-label={`Remove line ${i + 1}`} className="text-ink-3 hover:text-bad" onClick={() => setEdit({ ...edit, lines: edit.lines.filter((_, k) => k !== i) })}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(() => {
            const dr = round2(edit.lines.filter((l) => l.side === 'Dr').reduce((n, l) => n + l.pct, 0));
            const cr = round2(edit.lines.filter((l) => l.side === 'Cr').reduce((n, l) => n + l.pct, 0));
            return dr !== cr ? <Notice tone="warn">Debits total {dr}% and credits {cr}%; they must be equal.</Notice> : null;
          })()}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setEdit({ ...edit, lines: [...edit.lines, { ledger: '', side: 'Cr', pct: 0 }] })}>
              + Line
            </button>
            <button
              type="button"
              className="btn"
              disabled={!edit.name.trim() || edit.lines.filter((l) => l.ledger.trim()).length < 2 || round2(edit.lines.filter((l) => l.side === 'Dr').reduce((n, l) => n + l.pct, 0)) !== round2(edit.lines.filter((l) => l.side === 'Cr').reduce((n, l) => n + l.pct, 0))}
              onClick={() => void saveEdit()}
            >
              Save template
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>
              Cancel
            </button>
          </div>
        </Bench>
      )}

      <div className="border-t border-ink">
        {list.map((t) => {
          const v = fromTemplate(t, base > 0 ? base : 10000, date);
          const isOpen = open === t.id;
          return (
            <div key={t.id} className="border-b border-rule">
              <div className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 py-2.5">
                <input
                  type="checkbox"
                  aria-label={`Choose ${t.name}`}
                  checked={picked.has(t.id)}
                  onChange={(e) => {
                    const n = new Set(picked);
                    if (e.target.checked) n.add(t.id);
                    else n.delete(t.id);
                    setPicked(n);
                  }}
                />
                <button type="button" className="text-left" onClick={() => setOpen(isOpen ? null : t.id)} aria-expanded={isOpen}>
                  <span className="font-semibold">{t.name}</span>
                  <span className="ml-2 text-sm text-ink-3">
                    {t.type} · {t.custom ? 'My template' : t.category}
                  </span>
                </button>
                <button type="button" className="text-sm underline" onClick={() => toCreator([t])}>
                  Use
                </button>
              </div>
              {isOpen && (
                <div className="mb-3 ml-8 border border-rule bg-card p-3">
                  <table className="w-full text-[0.9rem]">
                    <tbody>
                      {v.entries.map((e, i) => (
                        <tr key={i}>
                          <td className="w-10 py-0.5">{e.dr ? 'Dr' : 'Cr'}</td>
                          <td className={e.cr ? 'pl-6' : ''}>{e.ledger}</td>
                          <td className="w-32 text-right font-mono">{e.dr ? money(e.dr) : ''}</td>
                          <td className="w-32 text-right font-mono">{e.cr ? money(e.cr) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-sm italic text-ink-2">{v.narration}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    <button type="button" className="underline" onClick={() => toCreator([t])}>
                      Open in Journal Entry Creator
                    </button>
                    <button type="button" className="underline" onClick={() => setEdit({ ...t, id: t.custom ? t.id : '', name: t.custom ? t.name : `${t.name} (my copy)`, category: 'My templates', custom: true, lines: t.lines.map((l) => ({ ...l })) })}>
                      {t.custom ? 'Edit' : 'Copy and change'}
                    </button>
                    {t.custom && (
                      <button type="button" className="underline hover:text-bad" onClick={() => void saveMine(mine.filter((x) => x.id !== t.id))}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!list.length && <p className="py-6 text-center text-ink-3">No template matches. Try another word, or create your own.</p>}
      </div>
    </div>
  );
}
