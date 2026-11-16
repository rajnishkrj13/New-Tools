'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { XLSX_TYPE } from '@/lib/gst/excel';
import { Notice, Spinner, download, sizeProblem, type ToolProps } from './kit';
import { Chip, Section } from './gst/ReturnUI';
import { useSaved } from './useSaved';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The merger core needs SheetJS (reading) and ExcelJS (writing); both load on first use. */
let corePromise: Promise<any> | null = null;
const loadCore = () =>
  (corePromise ??= Promise.all([import('xlsx'), import('exceljs'), import('@/lib/gst/gstr2b')]).then(([XLSX, ExcelJS, m]) => m.makeGstr2b(XLSX, ExcelJS.default)));

interface FileItem {
  id: number;
  parsed: any;
  state: string;
  source: string;
  candidates: string[];
}

const fmtInt = new Intl.NumberFormat('en-IN');
const fmtAmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const EMPTY_PARSED = (name: string, msg: string) => ({ filename: name, errors: [msg], warnings: [], counts: {}, totals: { igst: 0, cgst: 0, sgst: 0 }, extras: [], sheets: {} });

function Zone({ label, hint, multiple, onFiles, children }: { label: string; hint: string; multiple?: boolean; onFiles: (f: File[]) => void; children?: React.ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className="tray px-5 py-5"
      data-over={over}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <p className="min-w-[220px] flex-1 text-[0.9rem] text-ink-2">{hint}</p>
        <button type="button" className="btn" onClick={() => input.current?.click()}>
          {label}
        </button>
      </div>
      {children}
      <input
        ref={input}
        type="file"
        hidden
        multiple={multiple}
        accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
    </div>
  );
}

export default function Gstr2bMerger(props: ToolProps) {
  const canSave = props.features.saveStateNames !== false;
  const names = useSaved<Record<string, string>>('gstr2b-state-names', {}, { signedIn: props.signedIn, enabled: canSave });
  const [core, setCore] = useState<any>(null);
  const [master, setMaster] = useState<any>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'bad' | 'info'; text: string } | null>(null);
  const [result, setResult] = useState<{ bytes: Uint8Array; name: string; report: any } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    loadCore()
      .then(setCore)
      .catch(() => setNotice({ tone: 'bad', text: 'The Excel reader could not load. Check your connection and reload the page.' }));
  }, []);

  const masterKeyCounts = useMemo(() => {
    const c: Record<string, number> = {};
    if (master && core) core.SHEET_NAMES.forEach((n: string) => (master.sheets[n] || []).forEach((r: any[]) => (c[`${r[0]}|${r[1]}`] = (c[`${r[0]}|${r[1]}`] || 0) + 1)));
    return c;
  }, [master, core]);

  const suggest = (gstin: string, m = master) => core.suggestState(gstin, canSave ? names.value : {}, m);
  const withSuggestion = (f: FileItem, m = master): FileItem => {
    if (!f.parsed.gstin) return f;
    const s = suggest(f.parsed.gstin, m);
    return { ...f, state: s.label, source: s.source, candidates: s.candidates || [] };
  };

  const rememberName = (gstin: string, label: string) => {
    if (!canSave || !gstin) return;
    const next = { ...names.value };
    if (label) next[gstin] = label;
    else delete next[gstin];
    names.save(next);
  };

  /** Routes every file by what it is: a merged workbook (step 1) or a portal GSTR-2B download (step 2). */
  const intake = async (list: File[], preferred: 'master' | 'files') => {
    if (!core) return;
    setResult(null);
    const moved: string[] = [];
    const tooBig: string[] = [];
    let nextMaster = master;
    const added: FileItem[] = [];
    for (const f of list) {
      const p = sizeProblem(f, props);
      if (p) {
        tooBig.push(p);
        continue;
      }
      setBusy(`Reading ${f.name}…`);
      let wb: any = null;
      let kind = 'unknown';
      try {
        wb = core && (await import('xlsx')).read(new Uint8Array(await f.arrayBuffer()), { type: 'array' });
        kind = core.sniff(wb);
      } catch {
        kind = 'bad';
      }
      if (kind === 'master' || (kind === 'unknown' && preferred === 'master')) {
        if (preferred !== 'master' && kind === 'master') moved.push(`${f.name} looks like a merged file, so it was used as step 1.`);
        nextMaster = core.parseMaster(wb, f.name);
      } else {
        if (preferred === 'master' && kind === 'portal') moved.push(`${f.name} is a GSTR-2B download, so it was added to step 2.`);
        const parsed = kind === 'bad' ? EMPTY_PARSED(f.name, 'Could not open this file as an Excel workbook.') : core.parsePortal(wb, f.name);
        added.push(withSuggestion({ id: ++seq.current, parsed, state: '', source: '', candidates: [] }, nextMaster));
      }
    }
    setBusy('');
    if (nextMaster !== master) {
      setMaster(nextMaster);
      // Names that were only guessed are guessed again with what the merged file teaches.
      setFiles((cur) => [...cur.map((f) => (f.source !== 'typed' ? withSuggestion(f, nextMaster) : f)), ...added]);
    } else setFiles((cur) => [...cur, ...added]);
    const text = [...moved, ...tooBig].join(' ');
    setNotice(text ? { tone: tooBig.length ? 'bad' : 'info', text } : null);
  };

  const keyOf = (f: FileItem) => `${f.state.trim()}|${f.parsed.monthSerial}`;
  const usable = (f: FileItem) =>
    !f.parsed.errors.length || (f.parsed.gstin && f.parsed.monthSerial != null && core?.SHEET_NAMES.some((n: string) => (f.parsed.counts[n] || 0) > 0));
  const superseded = useMemo(() => {
    const last: Record<string, number> = {};
    const sup: Record<number, true> = {};
    files.forEach((f) => {
      if (f.state && usable(f) && f.parsed.monthSerial != null) {
        const k = keyOf(f);
        if (last[k]) sup[last[k]] = true;
        last[k] = f.id;
      }
    });
    return sup;
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusOf = (f: FileItem): { tone: 'err' | 'warn' | 'mut' | 'ok'; text: string } => {
    const p = f.parsed;
    if (p.gstin == null || p.monthSerial == null || !usable(f)) return { tone: 'err', text: 'Not merged' };
    if (!f.state.trim()) return { tone: 'warn', text: 'Type a state name' };
    if (superseded[f.id]) return { tone: 'mut', text: 'Duplicate, skipped' };
    const n = masterKeyCounts[keyOf(f)];
    return n ? { tone: 'warn', text: `Replaces ${fmtInt.format(n)} rows` } : { tone: 'ok', text: 'New' };
  };

  const ready = files.filter((f) => f.state.trim() && usable(f) && !superseded[f.id] && f.parsed.monthSerial != null).map((f) => ({ parsed: f.parsed, state: f.state.trim() }));
  const needName = files.some((f) => f.parsed.gstin && !f.state.trim());
  const outName = () => {
    if (master) return master.filename.replace(/\.(xlsm|xls)$/i, '.xlsx');
    const ln = files.find((f) => f.parsed.legalName)?.parsed;
    const ini = ln ? core.initials(ln.legalName) : '';
    return `${ini ? `${ini}_` : ''}GSTR-2B_Merged_Data.xlsx`;
  };
  const blocker = !files.length
    ? 'Add at least one GSTR-2B file.'
    : needName
      ? 'Type a state name for every file first.'
      : master?.errors.length
        ? 'Fix or remove the merged file in step 1.'
        : !ready.length
          ? 'None of these files can be merged.'
          : null;

  const coverage = useMemo(() => {
    if (!core) return null;
    const base = master ? core.coverage(master.sheets) : {};
    const pending: Record<string, { st: string; m: number; n: number; f: FileItem }> = {};
    files.forEach((f) => {
      if (!f.state || !usable(f) || superseded[f.id] || f.parsed.monthSerial == null) return;
      pending[keyOf(f)] = { st: f.state.trim(), m: f.parsed.monthSerial, n: f.parsed.counts.B2B || 0, f };
    });
    const states: Record<string, 1> = {};
    const months: Record<string, 1> = {};
    Object.keys(base).forEach((s) => {
      states[s] = 1;
      Object.keys(base[s]).forEach((m) => (months[m] = 1));
    });
    Object.values(pending).forEach((p) => {
      states[p.st] = 1;
      months[p.m] = 1;
    });
    return { base, pending, sl: Object.keys(states).sort(), ml: Object.keys(months).map(Number).sort((a, b) => a - b) };
  }, [core, master, files, superseded]); // eslint-disable-line react-hooks/exhaustive-deps

  const merge = async () => {
    if (!ready.length || blocker) return;
    setBusy('Building the workbook…');
    try {
      ready.forEach((it) => rememberName(it.parsed.gstin, it.state));
      const merged = core.merge(master, ready);
      const bytes = new Uint8Array(await core.writeWorkbook(merged));
      const name = outName();
      setResult({ bytes, name, report: merged.report });
      download(bytes, name, XLSX_TYPE);
      setNotice({ tone: 'ok', text: `Saved ${name}.` });
    } catch (e) {
      setNotice({ tone: 'bad', text: `Something went wrong while building the file: ${(e as Error).message}` });
    } finally {
      setBusy('');
    }
  };

  const datalist = useMemo(() => {
    const n: Record<string, 1> = {};
    Object.values(names.value).forEach((v) => (n[v] = 1));
    master?.labels.forEach((v: string) => (n[v] = 1));
    files.forEach((f) => f.state && (n[f.state] = 1));
    return Object.keys(n).sort();
  }, [names.value, master, files]);

  if (!core) return <Spinner text="Loading the Excel reader…" />;

  const masterMonths = master ? [...new Set<number>((master.sheets.B2B || []).map((r: any[]) => r[1]))].sort((a, b) => a - b) : [];

  return (
    <div className="space-y-5">
      <Section title="1 · Your merged file">
        {master ? (
          <div className="flex flex-wrap items-start gap-3 border-l-[3px] border-ink bg-paper-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{master.filename}</p>
              <p className="text-[0.88rem] text-ink-2">
                {fmtInt.format((master.sheets.B2B || []).length)} B2B, {fmtInt.format((master.sheets.B2BA || []).length)} B2BA, {fmtInt.format((master.sheets['B2B-CDNR'] || []).length)} B2B-CDNR rows. {master.labels.length} states,{' '}
                {masterMonths.length ? `${core.monthLabel(masterMonths[0])}${masterMonths.length > 1 ? ` to ${core.monthLabel(masterMonths[masterMonths.length - 1])}` : ''}` : 'no months yet'}.
              </p>
              {master.errors.length > 0 && <p className="text-[0.88rem] text-bad">{master.errors.join(' ')}</p>}
              {master.warnings.length > 0 && <p className="text-[0.85rem] text-warn">{master.warnings.join(' ')}</p>}
            </div>
            <button
              type="button"
              className="btn btn-ghost !min-h-9 text-sm"
              onClick={() => {
                setMaster(null);
                setResult(null);
                setFiles((cur) => cur.map((f) => (f.source !== 'typed' ? withSuggestion(f, null) : f)));
              }}
            >
              Remove
            </button>
          </div>
        ) : (
          <Zone label="Choose merged file" hint="Optional. The new months are added to it. Leave empty to start a fresh merged file." onFiles={(f) => intake(f.slice(0, 1), 'master')} />
        )}
      </Section>

      <Section title="2 · GSTR-2B downloads">
        <Zone
          label="Choose files"
          multiple
          hint="One or many, any month, any state. Use the files exactly as downloaded from the portal, for example 082026_29ABCDE1234F1Z5_GSTR2B_17092026.xlsx."
          onFiles={(f) => intake(f, 'files')}
        />
        {busy && <Spinner text={busy} />}
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

        {files.length > 0 && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-[0.85rem] text-ink-3">Tax columns total the B2B invoices, to tick against the portal&apos;s ITC Available summary.</p>
              <button type="button" className="btn btn-ghost !min-h-9 ml-auto text-sm" onClick={() => (setFiles([]), setResult(null))}>
                Clear list
              </button>
            </div>
            <datalist id="gstr2b-states">
              {datalist.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <div className="mt-2 overflow-x-auto border-t border-ink">
              <table className="w-full min-w-[1000px] border-collapse text-[0.85rem]">
                <thead>
                  <tr className="border-b border-ink text-left">
                    {['File and GSTIN', 'State', 'Month', 'B2B', 'B2BA', 'CDNR', 'IGST', 'CGST', 'SGST', 'Status', ''].map((h, i) => (
                      <th key={h || i} className={`label py-2 pr-2 font-normal ${i >= 3 && i <= 8 ? 'text-right' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => {
                    const p = f.parsed;
                    const st = statusOf(f);
                    return (
                      <tr key={f.id} className="border-b border-rule align-top">
                        <td className="max-w-[300px] py-2 pr-2">
                          <span className="break-all font-medium">{p.filename}</span>
                          <span className="block font-mono text-[0.8rem] text-ink-3">{p.gstin || 'GSTIN not found'}</span>
                          {p.errors.map((e: string) => (
                            <span key={e} className="block text-[0.8rem] text-bad">
                              {e}
                            </span>
                          ))}
                          {p.warnings.map((w: string) => (
                            <span key={w} className="block text-[0.8rem] text-warn">
                              {w}
                            </span>
                          ))}
                          {p.extras?.length > 0 && (
                            <span className="block text-[0.8rem] text-ink-3">
                              Also has data in {p.extras.map((x: any) => `${x.sheet} (${x.rows})`).join(', ')}. Those sheets aren&apos;t part of the merged format.
                            </span>
                          )}
                        </td>
                        <td className="pr-2">
                          {p.gstin ? (
                            <>
                              <input
                                className={`field !min-h-9 !w-40 !py-1 ${f.state ? '' : '!border-warn'}`}
                                list="gstr2b-states"
                                value={f.state}
                                placeholder="State name"
                                aria-label={`State name for ${p.gstin}`}
                                onChange={(e) => {
                                  setResult(null);
                                  setFiles((cur) => cur.map((x) => (x.id === f.id ? { ...x, state: e.target.value, source: 'typed' } : x)));
                                }}
                                onBlur={(e) => e.target.value.trim() && rememberName(p.gstin, e.target.value.trim())}
                              />
                              {f.candidates.length > 0 && !f.state && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {f.candidates.map((c) => (
                                    <button
                                      key={c}
                                      type="button"
                                      className="btn btn-ghost !min-h-7 !px-2 text-xs"
                                      onClick={() => {
                                        setFiles((cur) => cur.map((x) => (x.id === f.id ? { ...x, state: c, source: 'typed' } : x)));
                                        rememberName(p.gstin, c);
                                      }}
                                    >
                                      {c}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="whitespace-nowrap pr-2 font-mono">{p.monthSerial != null ? core.monthLabel(p.monthSerial) : '—'}</td>
                        {['B2B', 'B2BA', 'B2B-CDNR'].map((n) => (
                          <td key={n} className="pr-2 text-right font-mono">
                            {fmtInt.format(p.counts[n] || 0)}
                          </td>
                        ))}
                        {(['igst', 'cgst', 'sgst'] as const).map((k) => (
                          <td key={k} className="pr-2 text-right font-mono">
                            {fmtAmt.format(p.totals[k])}
                          </td>
                        ))}
                        <td className="pr-2">
                          <Chip tone={st.tone}>{st.text}</Chip>
                        </td>
                        <td>
                          <button type="button" className="text-ink-3 hover:text-bad" aria-label={`Remove ${p.filename}`} onClick={() => (setFiles(files.filter((x) => x.id !== f.id)), setResult(null))}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      {coverage && coverage.sl.length > 0 && (
        <Section title="B2B invoices by state and month" aside={<span className="text-[0.82rem] text-ink-3">{master ? `From ${master.filename}${Object.keys(coverage.pending).length ? ', with these files applied' : ''}` : 'New merged file'}</span>}>
          <p className="mb-2 flex flex-wrap gap-4 text-[0.82rem] text-ink-3">
            <span><Chip tone="ok">+ 120</Chip> added by these files</span>
            <span><Chip tone="warn">98 → 120</Chip> refreshed (old rows for that state and month are replaced)</span>
          </p>
          <div className="overflow-x-auto border-t border-ink">
            <table className="w-full border-collapse font-mono text-[0.82rem]">
              <thead>
                <tr className="border-b border-ink">
                  <th className="label py-2 pr-3 text-left font-normal">State</th>
                  {coverage.ml.map((m) => (
                    <th key={m} className="label px-2 text-right font-normal">
                      {core.monthLabel(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coverage.sl.map((s) => (
                  <tr key={s} className="border-b border-rule">
                    <td className="py-1.5 pr-3 font-sans font-medium">{s}</td>
                    {coverage.ml.map((m) => {
                      const p = coverage.pending[`${s}|${m}`];
                      const old = coverage.base[s]?.[m];
                      if (p) {
                        const swap = !!masterKeyCounts[`${s}|${m}`];
                        return (
                          <td key={m} className="px-2 text-right font-semibold" style={{ color: swap ? 'var(--warn)' : 'var(--ok)' }} title={`${p.f.parsed.filename}: ${p.f.parsed.counts.B2B || 0} B2B, ${p.f.parsed.counts.B2BA || 0} B2BA, ${p.f.parsed.counts['B2B-CDNR'] || 0} B2B-CDNR`}>
                            {swap ? (old ? `${fmtInt.format(old)} → ` : '') : '+'}
                            {fmtInt.format(p.n)}
                          </td>
                        );
                      }
                      return (
                        <td key={m} className={`px-2 text-right ${old ? '' : 'text-ink-3'}`}>
                          {old ? fmtInt.format(old) : '–'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title="3 · Merge">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" disabled={!!busy || !!blocker} onClick={merge}>
            Merge and download
          </button>
          <span className="text-[0.9rem] text-ink-2">{blocker ?? <>Saves as <b>{outName()}</b></>}</span>
        </div>
        {result && (
          <div className="mt-4">
            <table className="border-collapse font-mono text-[0.88rem]">
              <tbody>
                {core.SHEET_NAMES.map((n: string) => (
                  <tr key={n}>
                    <td className="pr-4 font-sans">{n}</td>
                    <td className="pr-2 text-right">{fmtInt.format(result.report.before[n])}</td>
                    <td className="pr-2">→</td>
                    <td className="text-right font-semibold">{fmtInt.format(result.report.after[n])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.report.added.length > 0 && (
              <p className="mt-2 text-[0.88rem] text-ink-2">
                Added: {result.report.added.map((k: string) => `${k.split('|')[0]} ${core.monthLabel(+k.split('|')[1])}`).join(', ')}.
              </p>
            )}
            {result.report.replaced.length > 0 && (
              <p className="text-[0.88rem] text-ink-2">
                Refreshed: {result.report.replaced.map((k: string) => `${k.split('|')[0]} ${core.monthLabel(+k.split('|')[1])}`).join(', ')}.
              </p>
            )}
            <button type="button" className="btn btn-ghost mt-3" onClick={() => download(result.bytes, result.name, XLSX_TYPE)}>
              Download again
            </button>
          </div>
        )}
        <p className="mt-4 text-[0.82rem] text-ink-3">
          Works with the portal&apos;s current GSTR-2B Excel layout (B2B 21 columns, B2BA 26, B2B-CDNR 28). If the portal moves columns, the affected sheet is skipped and flagged instead of
          landing in the wrong columns.
          {canSave && (
            <>
              {' '}
              State names you type are remembered for each GSTIN{props.signedIn ? ' on your account' : ' in this browser'}.{' '}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => {
                  names.save({});
                  setFiles((cur) => cur.map((f) => ({ ...f, state: '', source: '', candidates: [] })));
                  setNotice({ tone: 'info', text: 'Saved state names cleared.' });
                }}
              >
                Forget saved state names
              </button>
            </>
          )}
        </p>
      </Section>
    </div>
  );
}
