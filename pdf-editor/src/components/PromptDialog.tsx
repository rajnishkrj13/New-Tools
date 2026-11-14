import { useEffect, useState } from 'react';
import { getState, useEditorStore } from '../store/documentStore';

/** Small dialog for one answer: a page range, a password, a choice. */
export function PromptDialog() {
  const req = useEditorStore((s) => s.prompt);
  const [value, setValue] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(req?.initial ?? req?.options?.[0]?.value ?? '');
    setAgain('');
    setError(null);
  }, [req]);

  if (!req) return null;
  const finish = (answer: string | null) => {
    getState().setPrompt(null);
    req.resolve(answer);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (req.confirm && value !== again) return setError('The two entries are not the same.');
    const problem = req.validate?.(value) ?? null;
    if (problem) return setError(problem);
    finish(value);
  };
  const field = 'mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-sm';

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={req.title} onMouseDown={(e) => e.target === e.currentTarget && finish(null)}>
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-float" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), finish(null))}>
        <h2 className="text-base font-semibold text-slate-900">{req.title}</h2>
        {req.message && <p className="mt-1.5 text-sm leading-snug text-slate-600">{req.message}</p>}
        <label className="mt-3 block text-xs font-medium text-slate-600">
          {req.label}
          {req.options ? (
            <select autoFocus value={value} onChange={(e) => setValue(e.target.value)} className={field}>
              {req.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              type={req.password ? 'password' : 'text'}
              autoComplete={req.password ? 'new-password' : 'off'}
              value={value}
              placeholder={req.placeholder}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              className={field}
            />
          )}
        </label>
        {req.confirm && (
          <label className="mt-2 block text-xs font-medium text-slate-600">
            Type it again
            <input type="password" autoComplete="new-password" value={again} onChange={(e) => (setAgain(e.target.value), setError(null))} className={field} />
          </label>
        )}
        {error && <p role="alert" className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => finish(null)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">
            {req.okLabel ?? 'OK'}
          </button>
        </div>
      </form>
    </div>
  );
}
