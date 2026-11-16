'use client';

import { useState } from 'react';
import { UNIT_GROUPS, convert, tidy } from '@/lib/calc/units';
import { Bench, Segmented } from './kit';

export default function UnitConverter() {
  const [groupId, setGroupId] = useState('length');
  const group = UNIT_GROUPS.find((g) => g.id === groupId)!;
  // The value the user typed, and in which unit; every other box is computed from it.
  const [source, setSource] = useState<{ unit: string; text: string }>({ unit: 'm', text: '1' });
  const from = group.units.find((u) => u.id === source.unit) ?? group.units[0];
  const value = Number(source.text);

  return (
    <Bench>
      <Segmented
        label="What are you measuring"
        value={groupId}
        onChange={(id) => {
          setGroupId(id);
          const g = UNIT_GROUPS.find((x) => x.id === id)!;
          setSource({ unit: g.units[Math.min(2, g.units.length - 1)].id, text: '1' });
        }}
        options={UNIT_GROUPS.map((g) => ({ value: g.id, label: g.label }))}
      />
      <div className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {group.units.map((u) => {
          const mine = u.id === from.id;
          const text = mine ? source.text : source.text.trim() && Number.isFinite(value) ? tidy(convert(value, from, u)) : '';
          return (
            <label key={u.id} className="grid grid-cols-[1fr_11rem] items-center gap-3 border-b border-rule pb-3">
              <span>
                <span className="block text-[0.95rem] font-medium">{u.label}</span>
                {u.note && <span className="block text-[0.78rem] text-ink-3">{u.note}</span>}
              </span>
              <input
                className={`field text-right tabular-nums ${mine ? '!border-ink' : ''}`}
                inputMode="decimal"
                value={text}
                onChange={(e) => setSource({ unit: u.id, text: e.target.value })}
              />
            </label>
          );
        })}
      </div>
    </Bench>
  );
}
