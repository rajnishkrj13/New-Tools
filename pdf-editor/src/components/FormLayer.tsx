import { useEffect, useState } from 'react';
import type { PageInfo } from '../types/pdf';
import { findFormFields, type PageFormField } from '../engines/PdfRenderer';
import { getState, useEditorStore } from '../store/documentStore';

/**
 * Fill-in controls over the form fields the PDF already has. What is typed is kept by
 * field name and written into the real fields on export.
 */
export function FormLayer({ page }: { page: PageInfo }) {
  const zoom = useEditorStore((s) => s.zoom);
  const values = useEditorStore((s) => s.formValues);
  const tool = useEditorStore((s) => s.tool);
  const [fields, setFields] = useState<PageFormField[]>([]);

  useEffect(() => {
    let dead = false;
    findFormFields(page).then((list) => !dead && setFields(list));
    return () => {
      dead = true;
    };
  }, [page.id, page.rotation]);

  if (!fields.length) return null;
  const set = getState().setFormValue;
  // Other tools draw on the page; the fields only take input with the Select tool.
  const live = tool === 'select';

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {fields.map((f) => {
        const value = values[f.name] ?? f.value;
        const style: React.CSSProperties = {
          left: f.x * zoom, top: f.y * zoom, width: f.width * zoom, height: f.height * zoom,
          fontSize: Math.max(7, Math.min(f.height * 0.62, 12)) * zoom,
          pointerEvents: live && !f.readOnly ? 'auto' : 'none',
        };
        const cls = 'absolute m-0 rounded-[2px] border border-sky-400/70 bg-sky-100/70 text-slate-900 focus:bg-white';
        if (f.kind === 'checkbox' || f.kind === 'radio') {
          const checked = f.kind === 'checkbox' ? !!value : value === f.exportValue;
          return (
            <input
              key={f.key}
              type={f.kind}
              name={f.name}
              aria-label={f.name}
              disabled={f.readOnly}
              checked={checked}
              onChange={(e) => set(f.name, f.kind === 'checkbox' ? e.target.checked : f.exportValue)}
              className="absolute m-0 cursor-pointer"
              style={{ ...style, accentColor: '#2f7df6' }}
            />
          );
        }
        if (f.kind === 'choice') {
          return (
            <select key={f.key} aria-label={f.name} disabled={f.readOnly} value={String(value)} onChange={(e) => set(f.name, e.target.value)} className={`${cls} px-0.5`} style={style}>
              {!f.options.some((o) => o.value === value) && <option value={String(value)}>{String(value)}</option>}
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        }
        return f.multiline ? (
          <textarea key={f.key} aria-label={f.name} readOnly={f.readOnly} value={String(value)} onChange={(e) => set(f.name, e.target.value)} className={`${cls} resize-none px-1 py-0.5 leading-tight`} style={style} />
        ) : (
          <input key={f.key} type="text" aria-label={f.name} readOnly={f.readOnly} value={String(value)} onChange={(e) => set(f.name, e.target.value)} className={`${cls} px-1`} style={style} />
        );
      })}
    </div>
  );
}
