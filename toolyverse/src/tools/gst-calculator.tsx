'use client';

import { useState } from 'react';
import { GST_RATES, gst, rupees } from '@/lib/calc/gst';
import { Bench, Field, Segmented, useCopy } from './kit';

export default function GstCalculator() {
  const [amount, setAmount] = useState('1000');
  const [rate, setRate] = useState('18');
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [supply, setSupply] = useState<'intra' | 'inter'>('intra');
  const { copied, copy } = useCopy();
  const a = Number(amount.replace(/,/g, ''));
  const r = Number(rate);
  const ok = Number.isFinite(a) && a >= 0 && Number.isFinite(r) && r >= 0 && r <= 100 && amount.trim() !== '';
  const res = ok ? gst(a, r, mode) : null;

  const rows: [string, number][] = res
    ? [
        ['Price before GST', res.base],
        ...(supply === 'intra'
          ? ([
              [`CGST @ ${r / 2}%`, res.cgst],
              [`SGST / UTGST @ ${r / 2}%`, res.sgst],
            ] as [string, number][])
          : ([[`IGST @ ${r}%`, res.igst]] as [string, number][])),
        ['Total GST', res.tax],
      ]
    : [];

  return (
    <Bench>
      <div className="grid gap-8 md:grid-cols-[1fr_1fr]">
        <div className="space-y-5">
          <Field label="Amount (₹)">
            <input className="field !text-[1.25rem] tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby="gst-mode" />
          </Field>
          <div>
            <span className="label mb-1 block">GST rate</span>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented label="GST rate" value={GST_RATES.map(String).includes(rate) ? rate : ''} onChange={setRate} options={[5, 12, 18, 28].map((x) => ({ value: String(x), label: `${x}%` }))} />
              <input aria-label="Other rate (%)" className="field !min-h-10 !w-24" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
          </div>
          <div id="gst-mode" className="flex flex-wrap gap-3">
            <Segmented
              label="Add or remove GST"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'add', label: 'Add GST' },
                { value: 'remove', label: 'Remove GST' },
              ]}
            />
            <Segmented
              label="Type of supply"
              value={supply}
              onChange={setSupply}
              options={[
                { value: 'intra', label: 'Same state' },
                { value: 'inter', label: 'Other state' },
              ]}
            />
          </div>
          <p className="text-[0.88rem] text-ink-3">
            {mode === 'add' ? 'The amount is the price before tax.' : 'The amount already includes GST.'} {supply === 'intra' ? 'Tax splits into CGST and SGST.' : 'Tax is charged as IGST.'}
          </p>
        </div>

        <div className="border-t border-ink pt-4 md:border-l md:border-t-0 md:pl-8 md:pt-0">
          {res ? (
            <>
              <dl className="font-mono text-[0.98rem]">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-dashed border-rule-2 py-2.5">
                    <dt className="text-ink-2">{k}</dt>
                    <dd className="tabular-nums">{rupees(v)}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="label">{mode === 'add' ? 'Price including GST' : 'Price you entered'}</p>
                  <p className="display text-[2.4rem] tabular-nums">{rupees(res.total)}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => copy(rows.map(([k, v]) => `${k}: ${rupees(v)}`).join('\n') + `\nTotal: ${rupees(res.total)}`)}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </>
          ) : (
            <p className="text-ink-3">Enter an amount and a rate between 0 and 100.</p>
          )}
        </div>
      </div>
    </Bench>
  );
}
