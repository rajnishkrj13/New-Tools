'use client';

import { useMemo, useState } from 'react';
import { buildWorkbook, XL, XLSX_TYPE, type XSheet } from '@/lib/gst/excel';
import { GST, addReturns, fmt, r2, readReturns, sameRet, sharedReturns, today, type Ret } from '@/lib/gst/helpers';
import { Notice, Spinner, download, sizeProblem, type ToolProps } from './kit';
import { Chip, Coverage, Drop, MonthCell, ReturnFiles, Section } from './gst/ReturnUI';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Pairs GSTR-1 and GSTR-3B by GSTIN and month and compares them line by line (ported as is). */
function model(rets: Ret[], tol: number) {
  const g1 = GST.group(rets.filter((r) => !r.error && r.type === 'GSTR1'));
  const g3 = GST.group(rets.filter((r) => !r.error && r.type === 'GSTR3B'));
  const map: Record<string, any> = {};
  g1.list.forEach((g: any) => ((map[`${g.gstin}|${g.fy}`] ??= { gstin: g.gstin, fy: g.fy, state: g.state, legal: g.legal }).g1 = g));
  g3.list.forEach((g: any) => ((map[`${g.gstin}|${g.fy}`] ??= { gstin: g.gstin, fy: g.fy, state: g.state, legal: g.legal }).g3 = g));
  const list = Object.keys(map)
    .sort()
    .map((k) => {
      const x = map[k];
      x.key = k;
      x.months = {};
      x.year = {};
      x.both = 0;
      x.only1 = 0;
      x.only3 = 0;
      x.bad = 0;
      GST.FY_MONTHS.forEach((m: number) => {
        const r1 = x.g1 && x.g1.months[m];
        const r3 = x.g3 && x.g3.months[m];
        if (!r1 && !r3) return;
        const mm: any = { r1, r3, lines: {}, worst: 0, st: r1 && r3 ? 'both' : r1 ? 'g1' : 'g3' };
        GST.RECON.forEach((L: any) => {
          const o: any = {};
          L.heads.forEach((h: string) => {
            const b = r3 ? GST.reconValue(r3.f, L.b3, h) : null;
            const a = r1 ? GST.reconValue(r1.f, L.g1, h) : null;
            const d = b != null && a != null ? r2(b - a) : null;
            o[h] = { b, a, d };
            if (d != null && Math.abs(d) > mm.worst) mm.worst = Math.abs(d);
          });
          mm.lines[L.id] = o;
        });
        if (mm.st === 'both') {
          x.both++;
          if (mm.worst > tol) {
            mm.bad = true;
            x.bad++;
          }
        } else if (mm.st === 'g1') x.only1++;
        else x.only3++;
        x.months[m] = mm;
      });
      GST.RECON.forEach((L: any) => {
        const o: any = {};
        L.heads.forEach((h: string) => {
          let b = 0;
          let a = 0;
          GST.FY_MONTHS.forEach((m: number) => {
            const mm = x.months[m];
            if (mm && mm.st === 'both') {
              b += mm.lines[L.id][h].b || 0;
              a += mm.lines[L.id][h].a || 0;
            }
          });
          o[h] = { b: r2(b), a: r2(a), d: r2(b - a) };
        });
        x.year[L.id] = o;
      });
      x.T = function totalTaxDifference(m: number) {
        const mm = x.months[m];
        if (!mm || mm.st !== 'both') return null;
        const t = mm.lines.T;
        return r2(['i', 'c', 's', 'cs'].reduce((s, h) => s + (t[h].d || 0), 0));
      };
      return x;
    });
  return { list, dups: g1.dups.concat(g3.dups) };
}

function workbook(list: any[], tol: number) {
  const St = XL.S;
  const used: Record<string, number> = {};
  const out: { name: string; sheet: XSheet }[] = [];
  const heads = ['v', 'i', 'c', 's', 'cs'];
  const R: XSheet['rows'] = [[XL.t('GSTR-1 vs GSTR-3B reconciliation – summary', St.title)], [XL.t(`Prepared on ${today()} · difference = GSTR-3B − GSTR-1 · year = months where both returns are loaded · allowed difference ₹${tol}`, St.sub)], []];
  R.push(['GSTIN', 'State', 'FY', 'Comparison', 'Months compared', 'Months with difference', 'GSTR-1 only', 'GSTR-3B only', ...heads.map((h) => `Diff – ${GST.HEADS[h]}`)].map((h) => XL.t(h, St.headL)));
  list.forEach((x) => {
    GST.RECON.forEach((L: any, li: number) => {
      const nbad = GST.FY_MONTHS.filter((m: number) => {
        const mm = x.months[m];
        return mm && mm.st === 'both' && L.heads.some((h: string) => Math.abs(mm.lines[L.id][h].d || 0) > tol);
      }).length;
      R.push([
        XL.t(li ? '' : x.gstin, li ? St.cell : St.bold), XL.t(li ? '' : x.state), XL.t(li ? '' : x.fy), XL.t(`${L.id}. ${L.title}`), XL.i(x.both), XL.t(String(nbad), nbad ? St.err : St.ok), XL.i(x.only1), XL.i(x.only3),
        ...heads.map((h) => {
          const c = x.year[L.id][h];
          if (L.heads.indexOf(h) < 0) return XL.t('');
          return XL.n(c.d, Math.abs(c.d) > tol ? St.err : St.cell);
        }),
      ]);
    });
  });
  out.push({ name: XL.name('Summary', used), sheet: XL.sheet(R, [18, 15, 9, 52, 10, 12, 10, 10, 16, 15, 15, 15, 13]) });

  const C: XSheet['rows'] = [[XL.t('Returns loaded by GSTIN and month', St.title)], []];
  const fys: Record<string, any[]> = {};
  list.forEach((x) => (fys[x.fy] = fys[x.fy] || []).push(x));
  Object.keys(fys)
    .sort()
    .forEach((fy) => {
      C.push([XL.t(`FY ${fy}`, St.headL), XL.t('State', St.headL), ...GST.FY_MONTHS.map((m: number) => XL.t(GST.monName(m), St.head))]);
      fys[fy].forEach((x) =>
        C.push([
          XL.t(x.gstin), XL.t(x.state),
          ...GST.FY_MONTHS.map((m: number) => {
            const mm = x.months[m];
            if (!mm) return XL.t('');
            if (mm.st !== 'both') return XL.t(mm.st === 'g1' ? 'GSTR-1 only' : 'GSTR-3B only', St.warn);
            return XL.t(mm.bad ? 'Difference' : 'Matched', mm.bad ? St.err : St.ok);
          }),
        ]),
      );
      C.push([]);
    });
  out.push({ name: XL.name('Coverage', used), sheet: XL.sheet(C, [18, 16, ...GST.FY_MONTHS.map(() => 13)]) });

  list.forEach((x) => {
    const Q: XSheet['rows'] = [[XL.t(`GSTR-1 vs GSTR-3B – ${x.gstin} – ${x.state} – FY ${x.fy}`, St.title)], [XL.t(`${x.legal || ''} · difference = GSTR-3B − GSTR-1`, St.sub)], []];
    const merges: NonNullable<XSheet['merges']> = [];
    GST.RECON.forEach((L: any) => {
      const hs: string[] = L.heads;
      const n = hs.length;
      Q.push([XL.t(`${L.id}. ${L.title} — ${L.sub}`, St.grp), ...new Array(3 * n + 1).fill(XL.t('', St.grp))]);
      const r0 = Q.length;
      Q.push([XL.t('Month', St.headL), XL.t('GSTR-3B', St.g3), ...new Array(n - 1).fill(XL.t('', St.g3)), XL.t('GSTR-1', St.g1), ...new Array(n - 1).fill(XL.t('', St.g1)), XL.t('Difference', St.gd), ...new Array(n - 1).fill(XL.t('', St.gd)), XL.t('Status', St.headL)]);
      if (n > 1) [1, 1 + n, 1 + 2 * n].forEach((c) => merges.push({ s: { r: r0, c }, e: { r: r0, c: c + n - 1 } }));
      Q.push([XL.t('', St.headL), ...hs.map((h) => XL.t(GST.HEADS[h], St.head)), ...hs.map((h) => XL.t(GST.HEADS[h], St.head)), ...hs.map((h) => XL.t(GST.HEADS[h], St.head)), XL.t('', St.headL)]);
      GST.FY_MONTHS.forEach((m: number) => {
        const mm = x.months[m];
        const lab = XL.t(`${GST.monName(m)}-${String(GST.fyOf(x.fy, m)).slice(2)}`);
        if (!mm) {
          Q.push([lab, ...new Array(3 * n).fill(XL.t('')), XL.t('Not loaded')]);
          return;
        }
        const c = mm.lines[L.id];
        const bad = hs.some((h) => Math.abs(c[h].d || 0) > tol);
        const st = mm.st !== 'both' ? XL.t(mm.st === 'g1' ? 'GSTR-1 only' : 'GSTR-3B only', St.warn) : XL.t(bad ? 'Difference' : 'Matched', bad ? St.err : St.ok);
        Q.push([lab, ...hs.map((h) => XL.n(c[h].b)), ...hs.map((h) => XL.n(c[h].a)), ...hs.map((h) => XL.n(c[h].d, Math.abs(c[h].d || 0) > tol ? St.err : St.cell)), st]);
      });
      const y = x.year[L.id];
      Q.push([XL.t('Year (both loaded)', St.tot), ...hs.map((h) => XL.n(y[h].b, St.tot)), ...hs.map((h) => XL.n(y[h].a, St.tot)), ...hs.map((h) => XL.n(y[h].d, St.tot)), XL.t('', St.tot)]);
      Q.push([]);
    });
    out.push({ name: XL.name(`${x.gstin.slice(0, 2)} ${x.state} ${x.fy.slice(2)}`, used), sheet: XL.sheet(Q, [18, ...new Array(15).fill(15), 14], merges) });
  });

  const D: XSheet['rows'] = [[XL.t(`Every month-level difference above ₹${tol}`, St.title)], []];
  D.push(['GSTIN', 'State', 'FY', 'Month', 'Comparison', 'Head', 'GSTR-3B', 'GSTR-1', 'Difference'].map((h) => XL.t(h, St.headL)));
  list.forEach((x) =>
    GST.FY_MONTHS.forEach((m: number) => {
      const mm = x.months[m];
      if (!mm || mm.st !== 'both') return;
      GST.RECON.forEach((L: any) =>
        L.heads.forEach((h: string) => {
          const c = mm.lines[L.id][h];
          if (Math.abs(c.d || 0) > tol)
            D.push([XL.t(x.gstin), XL.t(x.state), XL.t(x.fy), XL.t(`${GST.monName(m)}-${String(GST.fyOf(x.fy, m)).slice(2)}`), XL.t(`${L.id}. ${L.title}`), XL.t(GST.HEADS[h]), XL.n(c.b), XL.n(c.a), XL.n(c.d, St.err)]);
        }),
      );
    }),
  );
  if (D.length === 3) D.push([XL.t('No differences above the allowed amount.', St.ok)]);
  out.push({ name: XL.name('Differences', used), sheet: XL.sheet(D, [18, 15, 9, 9, 50, 14, 16, 16, 16]) });
  return { sheets: out, fileName: `GSTR-1_vs_GSTR-3B_Reco_FY${Object.keys(fys).sort().join('_')}_${list.length}GSTIN.xlsx` };
}

export default function Gstr1VsGstr3b(props: ToolProps) {
  const [rets, setRets] = useState<Ret[]>([]);
  const [tol, setTol] = useState(1);
  const [sel, setSel] = useState('');
  const [month, setMonth] = useState<number | null>(null);
  const [showFiles, setShowFiles] = useState(false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const M = useMemo(() => model(rets, tol), [rets, tol]);
  const x = M.list.find((y) => y.key === sel) ?? M.list[0];
  const shared = sharedReturns().filter((r) => !rets.some((y) => sameRet(y, r)));
  const dcls = (d: number | null) => (d == null || Math.abs(d) <= tol ? 'text-ink-3' : d > 0 ? 'font-semibold text-bad' : 'font-semibold text-warn');
  const dtxt = (d: number | null) => (d == null ? '–' : Math.abs(d) <= tol ? '0.00' : (d > 0 ? '+' : '') + fmt(d));

  const add = (list: Ret[]) => setRets((cur) => addReturns(cur, list).list);
  const onFiles = async (files: File[]) => {
    const tooBig = files.map((f) => sizeProblem(f, props)).find(Boolean);
    const { rets: read, skipped } = await readReturns(files.filter((f) => !sizeProblem(f, props)), setBusy);
    setBusy('');
    add(read);
    setNote([skipped ? `${skipped} file(s) were not PDFs and were skipped.` : '', tooBig ?? ''].filter(Boolean).join(' ') || null);
  };
  const excel = async () => {
    setBusy('Building Excel…');
    try {
      const { sheets, fileName } = workbook(M.list, tol);
      download(await buildWorkbook(sheets), fileName, XLSX_TYPE);
    } catch (e) {
      setNote(`Could not build the Excel file: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const n1 = rets.filter((r) => r.type === 'GSTR1' && !r.error).length;
  const n3 = rets.filter((r) => r.type === 'GSTR3B' && !r.error).length;
  const ne = rets.filter((r) => r.error).length;
  const months = x ? GST.FY_MONTHS.filter((m: number) => x.months[m]) : [];
  const mm = x && month && x.months[month] ? x.months[month] : null;

  return (
    <div className="space-y-5">
      <Drop
        accept=".pdf,application/pdf"
        title="Drop GSTR-1 and GSTR-3B PDF files here"
        hint="Both types together, any GSTINs and months: they are told apart and paired by GSTIN and month."
        onFiles={onFiles}
        extra={
          shared.length ? (
            <button type="button" className="btn btn-ghost" onClick={() => add(shared)}>
              Use {shared.length} already loaded in other GST tools
            </button>
          ) : null
        }
      />
      {busy && <Spinner text={busy} />}
      {note && <Notice tone="warn">{note}</Notice>}

      {rets.length > 0 && (
        <Section
          title="Files"
          aside={
            <>
              <Chip tone="g1">{n1} GSTR-1</Chip>
              <Chip tone="g3">{n3} GSTR-3B</Chip>
              {ne > 0 && <Chip tone="err">{ne} not read</Chip>}
              <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={() => setShowFiles(!showFiles)}>
                {showFiles ? 'Hide list' : 'Show list'}
              </button>
              <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={() => window.confirm('Remove all files from this list?') && setRets([])}>
                Clear all
              </button>
            </>
          }
        >
          {showFiles && <ReturnFiles rets={rets} onRemove={(i) => setRets(rets.filter((_, k) => k !== i))} />}
          {M.dups.length > 0 && <Notice tone="warn">{M.dups.length} duplicate return(s) for the same GSTIN and month; the latest ARN date is used.</Notice>}
        </Section>
      )}

      {M.list.length > 0 && x ? (
        <>
          <Section
            title="Overview"
            aside={
              <label className="flex items-center gap-2 text-[0.88rem] text-ink-2">
                Allowed difference (₹)
                <input type="number" min={0} step={1} value={tol} onChange={(e) => Number(e.target.value) >= 0 && setTol(Number(e.target.value))} className="field !min-h-9 !w-24 !py-1" />
              </label>
            }
          >
            <p className="mb-3 flex flex-wrap gap-4 text-[0.82rem] text-ink-3">
              <span><MonthCell bg="var(--ok)">✓</MonthCell> matches</span>
              <span><MonthCell bg="var(--bad)">1,234</MonthCell> total tax difference (3B − GSTR-1)</span>
              <span><MonthCell bg="var(--warn)">G1</MonthCell> / <MonthCell bg="var(--warn)">3B</MonthCell> only one return loaded</span>
              <span>Pick a GSTIN below to see its details</span>
            </p>
            <Coverage
              groups={M.list}
              dups={[]}
              render={(g, m) => {
                const z = g.months[m];
                if (!z) return <span className="text-ink-3">–</span>;
                if (z.st !== 'both') return <MonthCell bg="var(--warn)">{z.st === 'g1' ? 'G1' : '3B'}</MonthCell>;
                if (!z.bad) return <MonthCell bg="var(--ok)">✓</MonthCell>;
                const t = g.T(m);
                return (
                  <MonthCell bg="var(--bad)" title={`Largest difference ${fmt(z.worst)}`}>
                    {Math.abs(t) > tol ? fmt(t, 0) : '≠'}
                  </MonthCell>
                );
              }}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {M.list.map((y) => (
                <button key={y.key} type="button" onClick={() => (setSel(y.key), setMonth(null))} className={`btn btn-ghost !min-h-9 text-sm ${y.key === x.key ? '!border-ink !bg-paper-2' : ''}`}>
                  {y.gstin} · FY {y.fy} · {y.bad ? `${y.bad} month(s) differ` : 'all matched'}
                </button>
              ))}
            </div>
          </Section>

          <Section
            title={`${x.gstin} · ${x.state} · FY ${x.fy}`}
            aside={
              <>
                <Chip>{x.both} month(s) compared</Chip>
                {x.only1 > 0 && <Chip tone="warn">{x.only1} GSTR-1 only</Chip>}
                {x.only3 > 0 && <Chip tone="warn">{x.only3} GSTR-3B only</Chip>}
              </>
            }
          >
            <p className="mb-2 text-[0.85rem] text-ink-3">Differences (GSTR-3B − GSTR-1) by comparison and month. Click a month to see both returns side by side. “Year” adds up the months where both returns are loaded.</p>
            <div className="max-h-[560px] overflow-auto border-t border-ink">
              <table className="w-full min-w-[980px] border-collapse text-[0.82rem]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-ink">
                    <th className="label py-2 pr-2 text-left font-normal">Comparison</th>
                    <th className="label pr-2 text-left font-normal">Head</th>
                    {months.map((m: number) => (
                      <th key={m} className="px-1 text-right">
                        <button type="button" onClick={() => setMonth(month === m ? null : m)} className={`label px-1.5 py-0.5 ${month === m ? '!bg-ink !text-paper' : 'hover:!text-ink'}`}>
                          {GST.monName(m)}
                          {x.months[m].st !== 'both' ? ` (${x.months[m].st === 'g1' ? 'G1' : '3B'})` : ''}
                        </button>
                      </th>
                    ))}
                    <th className="label px-1.5 text-right font-normal">Year</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {GST.RECON.map((L: any) =>
                    L.heads.map((hd: string, hi: number) => (
                      <tr key={`${L.id}${hd}`} className={`border-b border-rule ${hi === 0 ? 'border-t border-t-rule-2' : ''}`}>
                        <td className="min-w-[240px] py-1 pr-2 align-top font-sans">
                          {hi === 0 && (
                            <>
                              <b className="font-semibold">
                                {L.id}. {L.title}
                              </b>
                              <span className="block max-w-[330px] text-[0.75rem] text-ink-3">{L.sub}</span>
                            </>
                          )}
                        </td>
                        <td className="pr-2 font-sans text-[0.75rem] text-ink-3">{GST.HEADS[hd]}</td>
                        {months.map((m: number) => {
                          const c = x.months[m].lines[L.id][hd];
                          return (
                            <td key={m} className={`px-1.5 text-right ${dcls(c.d)}`}>
                              {dtxt(c.d)}
                            </td>
                          );
                        })}
                        <td className={`px-1.5 text-right font-semibold ${dcls(x.year[L.id][hd].d)}`}>{dtxt(x.year[L.id][hd].d)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>

            {mm && month && (
              <div className="mt-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="display text-[1.15rem]">
                    {GST.MONTHS[month - 1]} {GST.fyOf(x.fy, month)}: both returns side by side
                  </h3>
                  {mm.r3 ? <Chip tone="g3">3B ARN {mm.r3.arn} · {mm.r3.arnDate}</Chip> : <Chip tone="warn">GSTR-3B not loaded</Chip>}
                  {mm.r1 ? <Chip tone="g1">GSTR-1 ARN {mm.r1.arn} · {mm.r1.arnDate}</Chip> : <Chip tone="warn">GSTR-1 not loaded</Chip>}
                </div>
                <div className="mt-2 overflow-x-auto border-t border-ink">
                  <table className="w-full min-w-[720px] border-collapse text-[0.85rem]">
                    <thead>
                      <tr className="border-b border-ink text-left">
                        {['Comparison', 'Head', 'GSTR-3B', 'GSTR-1', 'Difference'].map((h, i) => (
                          <th key={h} className={`label py-2 pr-2 font-normal ${i > 1 ? 'text-right' : ''}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="font-mono tabular-nums">
                      {GST.RECON.map((L: any) =>
                        L.heads.map((hd: string, hi: number) => {
                          const c = mm.lines[L.id][hd];
                          return (
                            <tr key={`${L.id}${hd}`} className="border-b border-rule">
                              <td className="py-1 pr-2 font-sans">{hi === 0 ? <b className="font-semibold">{L.id}. {L.title}</b> : ''}</td>
                              <td className="pr-2 font-sans text-[0.75rem] text-ink-3">{GST.HEADS[hd]}</td>
                              <td className="pr-2 text-right">{c.b == null ? '–' : fmt(c.b)}</td>
                              <td className="pr-2 text-right">{c.a == null ? '–' : fmt(c.a)}</td>
                              <td className={`pr-2 text-right ${dcls(c.d)}`}>{dtxt(c.d)}</td>
                            </tr>
                          );
                        }),
                      )}
                      <tr className="bg-paper-2">
                        <td colSpan={5} className="label py-1.5 pl-1">
                          For information (not compared)
                        </td>
                      </tr>
                      <tr className="border-b border-rule">
                        <td className="py-1 pr-2 font-sans">Outward supplies attracting reverse charge (GSTR-1 4B)</td>
                        <td className="pr-2 font-sans text-[0.75rem] text-ink-3">Taxable value</td>
                        <td className="pr-2 text-right">–</td>
                        <td className="pr-2 text-right">{mm.r1?.f.B2BRC ? fmt(mm.r1.f.B2BRC.v) : '–'}</td>
                        <td />
                      </tr>
                      <tr className="border-b border-rule">
                        <td className="py-1 pr-2 font-sans">Inward supplies liable to reverse charge (GSTR-3B 3.1(d))</td>
                        <td className="pr-2 font-sans text-[0.75rem] text-ink-3">Taxable value</td>
                        <td className="pr-2 text-right">{mm.r3?.f['3.1d'] ? fmt(mm.r3.f['3.1d'].v) : '–'}</td>
                        <td className="pr-2 text-right">–</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>

          <Section
            title="Excel file"
            aside={
              <button type="button" className="btn" disabled={!!busy} onClick={excel}>
                Download Excel
              </button>
            }
          >
            <p className="text-[0.88rem] text-ink-3">Summary · coverage · one sheet per GSTIN with each comparison month by month (GSTR-3B | GSTR-1 | difference) · list of every difference.</p>
          </Section>
        </>
      ) : (
        !rets.length && (
          <Section title="What is compared">
            <div className="overflow-x-auto border-t border-ink">
              <table className="w-full min-w-[640px] border-collapse text-[0.88rem]">
                <thead>
                  <tr className="border-b border-ink text-left">
                    {['Comparison', 'GSTR-3B', 'GSTR-1'].map((h) => (
                      <th key={h} className="label py-2 pr-3 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GST.RECON.map((L: any) => {
                    const [b, a] = L.sub.split(' vs ');
                    return (
                      <tr key={L.id} className="border-b border-rule align-top">
                        <td className="py-2 pr-3 font-semibold">{L.title}</td>
                        <td className="pr-3 text-ink-2">{b}</td>
                        <td className="pr-3 text-ink-2">{a}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        )
      )}
    </div>
  );
}
