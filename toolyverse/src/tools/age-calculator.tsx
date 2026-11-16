'use client';

import { useEffect, useState } from 'react';
import { dateDiff, nextBirthday } from '@/lib/calc/text';
import { Bench, Field } from './kit';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

export default function AgeCalculator() {
  const [birth, setBirth] = useState('2000-01-01');
  // "Today" is set in the browser so the server-rendered page is not stuck on a past date.
  const [on, setOn] = useState('');
  // eslint-disable-next-line react-hooks/set-state-in-effect -- today is only known in the browser (the page is server-rendered)
  useEffect(() => setOn(iso(new Date())), []);
  const a = parse(birth);
  const b = parse(on);
  const ok = a && b && b >= a;
  const d = ok ? dateDiff(a, b) : null;
  const nb = ok ? nextBirthday(a, b) : null;
  const n = new Intl.NumberFormat('en-IN');

  return (
    <Bench>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Date of birth (or start date)">
          <input type="date" className="field" value={birth} max={on || undefined} onChange={(e) => setBirth(e.target.value)} />
        </Field>
        <Field label="Age on" hint="Today, or a cut-off date such as an exam's">
          <input type="date" className="field" value={on} onChange={(e) => setOn(e.target.value)} />
        </Field>
      </div>
      <div className="mt-6 border-t border-ink pt-5" aria-live="polite">
        {d && nb ? (
          <>
            <p className="display text-[2.3rem] leading-tight">
              {d.years} <span className="text-ink-3">years</span> {d.months} <span className="text-ink-3">months</span> {d.days} <span className="text-ink-3">days</span>
            </p>
            <dl className="mt-5 grid gap-x-8 gap-y-2 font-mono text-[0.95rem] sm:grid-cols-2">
              {[
                ['Total months', n.format(d.totalMonths)],
                ['Total weeks', n.format(d.totalWeeks)],
                ['Total days', n.format(d.totalDays)],
                ['Next birthday', `${nb.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}, ${nb.weekday} (${nb.days ? `in ${nb.days} days` : 'today'})`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-dashed border-rule-2 py-1.5">
                  <dt className="text-ink-2">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="text-ink-3">{on ? 'The second date must be on or after the first.' : 'Choose the dates.'}</p>
        )}
      </div>
    </Bench>
  );
}
