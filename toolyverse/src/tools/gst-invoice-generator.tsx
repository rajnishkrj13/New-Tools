'use client';

import { useEffect, useMemo, useState } from 'react';
import { GST_STATES, r2, rupees } from '@/lib/calc/gst';
import { numberToWords } from '@/lib/calc/words';
import { Bench, Field, Notice, type ToolProps } from './kit';
import { useSaved } from './useSaved';

interface Party {
  name: string;
  address: string;
  gstin: string;
  state: string;
  phone: string;
  email: string;
}
interface Item {
  desc: string;
  hsn: string;
  qty: string;
  unit: string;
  rate: string;
  gst: string;
}
interface Business {
  seller: Party;
  bank: string;
  terms: string;
  prefix: string;
  next: number;
}

const EMPTY_PARTY: Party = { name: '', address: '', gstin: '', state: '27', phone: '', email: '' };
const EMPTY_ITEM: Item = { desc: '', hsn: '', qty: '1', unit: 'Nos', rate: '', gst: '18' };
const DEFAULT_BUSINESS: Business = { seller: EMPTY_PARTY, bank: '', terms: 'Payment due within 15 days.', prefix: 'INV-', next: 1 };
const today = () => new Date().toISOString().slice(0, 10);
const num = (s: string) => {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const states = Object.entries(GST_STATES).filter(([c]) => c !== '99');

function PartyFields({ title, value, onChange }: { title: string; value: Party; onChange: (p: Party) => void }) {
  const set = (k: keyof Party) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <fieldset className="space-y-3">
      <legend className="label mb-2">{title}</legend>
      <Field label="Name">
        <input className="field" value={value.name} onChange={set('name')} />
      </Field>
      <Field label="Address">
        <textarea className="field !min-h-[4.5rem]" rows={2} value={value.address} onChange={set('address')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="GSTIN">
          <input
            className="field font-mono uppercase"
            value={value.gstin}
            maxLength={15}
            onChange={(e) => {
              const g = e.target.value.toUpperCase();
              onChange({ ...value, gstin: g, state: GST_STATES[g.slice(0, 2)] ? g.slice(0, 2) : value.state });
            }}
          />
        </Field>
        <Field label="State">
          <select className="field" value={value.state} onChange={set('state')}>
            {states.map(([c, n]) => (
              <option key={c} value={c}>
                {c} Â· {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phone">
          <input className="field" value={value.phone} onChange={set('phone')} />
        </Field>
        <Field label="Email">
          <input className="field" value={value.email} onChange={set('email')} />
        </Field>
      </div>
    </fieldset>
  );
}

export default function GstInvoiceGenerator(props: ToolProps) {
  const canSave = props.features.saveBusiness !== false;
  const biz = useSaved<Business>('gst-invoice-business', DEFAULT_BUSINESS, { signedIn: props.signedIn, enabled: canSave });
  const [seller, setSeller] = useState<Party>(EMPTY_PARTY);
  const [buyer, setBuyer] = useState<Party>({ ...EMPTY_PARTY });
  const [items, setItems] = useState<Item[]>([{ ...EMPTY_ITEM, desc: 'Consulting services', hsn: '998311', rate: '25000' }]);
  const [no, setNo] = useState('INV-1');
  const [date, setDate] = useState('');
  const [bank, setBank] = useState('');
  const [terms, setTerms] = useState(DEFAULT_BUSINESS.terms);
  const [saved, setSaved] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- today is only known in the browser
  useEffect(() => setDate(today()), []);
  useEffect(() => {
    if (!biz.loaded) return;
    // Saved details arrive asynchronously (browser storage or the account); they prefill the form once.
    /* eslint-disable react-hooks/set-state-in-effect */
    setSeller(biz.value.seller);
    setBank(biz.value.bank);
    setTerms(biz.value.terms);
    setNo(`${biz.value.prefix}${biz.value.next}`);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [biz.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const inter = seller.state !== buyer.state;
  const calc = useMemo(() => {
    const lines = items.map((it) => {
      const taxable = r2(num(it.qty) * num(it.rate));
      const gstRate = num(it.gst);
      const tax = r2((taxable * gstRate) / 100);
      return { ...it, taxable, gstRate, tax };
    });
    const taxable = r2(lines.reduce((s, l) => s + l.taxable, 0));
    const tax = r2(lines.reduce((s, l) => s + l.tax, 0));
    const exact = taxable + tax;
    const total = Math.round(exact);
    // Summary per rate, as tax invoices usually show it.
    const byRate = new Map<number, { taxable: number; tax: number }>();
    for (const l of lines) {
      const r = byRate.get(l.gstRate) ?? { taxable: 0, tax: 0 };
      r.taxable = r2(r.taxable + l.taxable);
      r.tax = r2(r.tax + l.tax);
      byRate.set(l.gstRate, r);
    }
    return { lines, taxable, tax, roundOff: r2(total - exact), total, byRate: [...byRate.entries()].sort((a, b) => a[0] - b[0]) };
  }, [items]);

  const setItem = (i: number, k: keyof Item, v: string) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const words = calc.total ? numberToWords(String(calc.total), { style: 'indian', currency: 'inr' }) : '';

  const saveBusiness = async (advance: boolean) => {
    const m = /^(.*?)(\d+)$/.exec(no);
    const prefix = m ? m[1] : biz.value.prefix;
    const current = m ? Number(m[2]) : biz.value.next;
    await biz.save({ seller, bank, terms, prefix, next: advance ? current + 1 : current });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Bench className="print:hidden">
        <div className="grid gap-6 md:grid-cols-2">
          <PartyFields title="From (your business)" value={seller} onChange={setSeller} />
          <PartyFields title="Bill to (customer)" value={buyer} onChange={setBuyer} />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Field label="Invoice number">
            <input className="field font-mono" value={no} onChange={(e) => setNo(e.target.value)} />
          </Field>
          <Field label="Invoice date">
            <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        <fieldset className="mt-6">
          <legend className="label mb-2">Items</legend>
          <div className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-6 gap-2 border-b border-rule pb-3">
                <input aria-label={`Item ${i + 1} description`} placeholder="Description" className="field col-span-6" value={it.desc} onChange={(e) => setItem(i, 'desc', e.target.value)} />
                <input aria-label="HSN or SAC" placeholder="HSN/SAC" className="field col-span-2 font-mono" value={it.hsn} onChange={(e) => setItem(i, 'hsn', e.target.value)} />
                <input aria-label="Quantity" placeholder="Qty" inputMode="decimal" className="field col-span-1 text-right" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
                <input aria-label="Unit" placeholder="Unit" className="field col-span-1" value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} />
                <input aria-label="Rate" placeholder="Rate â‚¹" inputMode="decimal" className="field col-span-1 text-right" value={it.rate} onChange={(e) => setItem(i, 'rate', e.target.value)} />
                <select aria-label="GST %" className="field col-span-1" value={it.gst} onChange={(e) => setItem(i, 'gst', e.target.value)}>
                  {/* 5, 18 and 40 since 22 Sep 2025; 12 and 28 kept for notes against older bills. */}
                  {['0', '0.25', '3', '5', '12', '18', '28', '40'].map((g) => (
                    <option key={g} value={g}>
                      {g}%
                    </option>
                  ))}
                </select>
                {items.length > 1 && (
                  <button type="button" className="col-span-6 justify-self-end text-sm text-ink-3 hover:text-bad" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                    Remove item
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost mt-3" onClick={() => setItems([...items, { ...EMPTY_ITEM }])}>
            + Add item
          </button>
        </fieldset>

        <div className="mt-6 grid gap-3">
          <Field label="Bank details (optional)">
            <textarea className="field !min-h-[4rem]" rows={2} value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Bank, account number, IFSC, UPI" />
          </Field>
          <Field label="Terms (optional)">
            <input className="field" value={terms} onChange={(e) => setTerms(e.target.value)} />
          </Field>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => window.print()}>
            Print or save as PDF
          </button>
          {canSave && (
            <button type="button" className="btn btn-ghost" onClick={() => saveBusiness(true)}>
              {saved ? 'Saved' : 'Save my details & next number'}
            </button>
          )}
        </div>
        {canSave && (
          <p className="mt-2 text-[0.82rem] text-ink-3">
            {props.signedIn ? 'Saved to your account, so they are here on any device.' : 'Saved in this browser only. Sign in to keep them on your account.'}
          </p>
        )}
        {seller.gstin && seller.gstin.length !== 15 && <Notice tone="warn">Your GSTIN should have 15 characters.</Notice>}
      </Bench>

      {/* The invoice itself: plain black on white so it prints and saves cleanly. */}
      <div id="print-area" className="self-start overflow-x-auto border border-ink bg-white p-6 text-[13px] leading-snug text-black print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-6 border-b-2 border-black pb-3">
          <div>
            <p className="text-[18px] font-bold">{seller.name || 'Your business name'}</p>
            <p className="whitespace-pre-line">{seller.address}</p>
            {seller.gstin && <p>GSTIN: <b className="font-mono">{seller.gstin}</b></p>}
            <p>
              {GST_STATES[seller.state]} ({seller.state}){seller.phone ? ` Â· ${seller.phone}` : ''}
              {seller.email ? ` Â· ${seller.email}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[20px] font-bold tracking-wide">TAX INVOICE</p>
            <p>
              No. <b className="font-mono">{no}</b>
            </p>
            <p>Date: {date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6 border-b border-black py-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider">Bill to</p>
            <p className="font-bold">{buyer.name || 'Customer name'}</p>
            <p className="whitespace-pre-line">{buyer.address}</p>
            {buyer.gstin && <p>GSTIN: <b className="font-mono">{buyer.gstin}</b></p>}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider">Place of supply</p>
            <p>
              {GST_STATES[buyer.state]} ({buyer.state})
            </p>
            <p className="mt-1 text-[11px]">{inter ? 'Inter-state supply: IGST' : 'Intra-state supply: CGST + SGST'}</p>
          </div>
        </div>
        <table className="mt-3 w-full border-collapse">
          <thead>
            <tr className="border-y border-black text-left text-[11px] uppercase">
              <th className="py-1.5 pr-2">#</th>
              <th className="pr-2">Description</th>
              <th className="pr-2">HSN/SAC</th>
              <th className="pr-2 text-right">Qty</th>
              <th className="pr-2 text-right">Rate</th>
              <th className="pr-2 text-right">Taxable</th>
              <th className="text-right">GST</th>
            </tr>
          </thead>
          <tbody>
            {calc.lines.map((l, i) => (
              <tr key={i} className="border-b border-neutral-300 align-top">
                <td className="py-1.5 pr-2">{i + 1}</td>
                <td className="pr-2">{l.desc}</td>
                <td className="pr-2 font-mono">{l.hsn}</td>
                <td className="pr-2 text-right">
                  {l.qty} {l.unit}
                </td>
                <td className="pr-2 text-right">{rupees(num(l.rate))}</td>
                <td className="pr-2 text-right">{rupees(l.taxable)}</td>
                <td className="text-right">{l.gstRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex justify-end">
          <table className="min-w-[260px] border-collapse">
            <tbody>
              <tr>
                <td className="py-0.5 pr-4">Taxable value</td>
                <td className="text-right">{rupees(calc.taxable)}</td>
              </tr>
              {calc.byRate
                .filter(([rate]) => rate > 0)
                .map(([rate, v]) =>
                  inter ? (
                    <tr key={rate}>
                      <td className="py-0.5 pr-4">IGST @ {rate}%</td>
                      <td className="text-right">{rupees(v.tax)}</td>
                    </tr>
                  ) : (
                    [
                      <tr key={`c${rate}`}>
                        <td className="py-0.5 pr-4">CGST @ {rate / 2}%</td>
                        <td className="text-right">{rupees(v.tax / 2)}</td>
                      </tr>,
                      <tr key={`s${rate}`}>
                        <td className="py-0.5 pr-4">SGST @ {rate / 2}%</td>
                        <td className="text-right">{rupees(v.tax / 2)}</td>
                      </tr>,
                    ]
                  ),
                )}
              {calc.roundOff !== 0 && (
                <tr>
                  <td className="py-0.5 pr-4">Round off</td>
                  <td className="text-right">{rupees(calc.roundOff)}</td>
                </tr>
              )}
              <tr className="border-t-2 border-black text-[15px] font-bold">
                <td className="py-1.5 pr-4">Total</td>
                <td className="text-right">{rupees(calc.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {words && <p className="mt-2 border-y border-black py-1.5"><span className="text-[11px] uppercase tracking-wider">Amount in words: </span>{words}</p>}
        <div className="mt-4 grid grid-cols-2 gap-6">
          <div>
            {bank && (
              <>
                <p className="text-[11px] uppercase tracking-wider">Bank details</p>
                <p className="whitespace-pre-line">{bank}</p>
              </>
            )}
            {terms && <p className="mt-2 text-[11px]">{terms}</p>}
          </div>
          <div className="self-end text-right">
            <p className="mb-10">For {seller.name || 'your business'}</p>
            <p className="border-t border-black pt-1 text-[11px]">Authorised signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}
