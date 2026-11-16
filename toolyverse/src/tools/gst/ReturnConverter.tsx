'use client';

import { useMemo, useState } from 'react';
import { buildWorkbook, XL, XLSX_TYPE, type XSheet } from '@/lib/gst/excel';
import { GST, addReturns, allRows, checksOf, level, readReturns, retSort, sameRet, sharedReturns, today, type Ret } from '@/lib/gst/helpers';
import { Notice, Spinner, download, sizeProblem, type ToolProps } from '../kit';
import { Chip, Coverage, Drop, MonthTable, ReturnFiles, Section } from './ReturnUI';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** One GSTR-1 or GSTR-3B converter: many portal PDFs in, one Excel workbook out. */
export interface ConverterConfig {
  type: 'GSTR1' | 'GSTR3B';
  short: string;
  file: string;
  fields: any[];
  /** Columns of the "Returns" sheet: [heading, field key, head]. */
  retCols: [string, string, string][];
  sheets: string;
  how: string[];
  detail: (rets: Ret[]) => { rows: XSheet['rows']; widths: number[] };
  extra?: (rets: Ret[], used: Record<string, number>) => { name: string; sheet: XSheet }[];
}

/** The "Returns" list, coverage, all GSTINs per year and one month-wise sheet per GSTIN-year. */
function workbookSheets(cfg: ConverterConfig, rets: Ret[], withDetail: boolean) {
  const St = XL.S;
  const used: Record<string, number> = {};
  const out: { name: string; sheet: XSheet }[] = [];
  const sorted = rets.slice().sort(retSort);
  const groups = GST.group(sorted).list;

  const R: XSheet['rows'] = [[XL.t(`${cfg.short} returns read`, St.title)], [XL.t(`Prepared on ${today()} · ${sorted.length} returns · ${groups.length} GSTIN-year(s)`, St.sub)], []];
  R.push(['Sr.', 'GSTIN', 'State', 'Legal name', 'FY', 'Tax period', 'ARN', 'ARN date', ...cfg.retCols.map((c) => c[0]), 'Checks', 'File'].map((h) => XL.t(h, St.headL)));
  sorted.forEach((r, i) => {
    const lv = level(r);
    const msgs = checksOf(r)
      .filter((c) => c.lvl !== 'ok')
      .map((c) => c.msg);
    R.push([
      XL.i(i + 1), XL.t(r.gstin), XL.t(r.state), XL.t(r.legal), XL.t(r.fy), XL.t(r.periodText), XL.t(r.arn), XL.t(r.arnDate),
      ...cfg.retCols.map((c) => {
        const x = r.f[c[1]];
        return XL.n(x ? x[c[2]] : null);
      }),
      XL.t(lv === 'ok' ? 'All checks passed' : msgs.join(' | '), St[lv]),
      XL.t(r.file),
    ]);
  });
  out.push({ name: XL.name('Returns', used), sheet: XL.sheet(R, [5, 18, 16, 34, 9, 12, 18, 11, ...cfg.retCols.map(() => 16), 46, 40]) });

  const C: XSheet['rows'] = [[XL.t('Returns by GSTIN and month', St.title)], [XL.t('Filed = return loaded in this file. Blank = not loaded.', St.sub)], []];
  const fys: Record<string, any[]> = {};
  groups.forEach((g: any) => (fys[g.fy] = fys[g.fy] || []).push(g));
  Object.keys(fys)
    .sort()
    .forEach((fy) => {
      C.push([XL.t(`FY ${fy}`, St.headL), XL.t('State', St.headL), ...GST.FY_MONTHS.map((m: number) => XL.t(GST.monName(m), St.head)), XL.t('Months', St.head)]);
      fys[fy].forEach((g) => {
        let n = 0;
        C.push([
          XL.t(g.gstin), XL.t(g.state),
          ...GST.FY_MONTHS.map((m: number) => {
            const r = g.months[m];
            if (!r) return XL.t('', St.cell);
            n++;
            const lv = level(r);
            return XL.t(lv === 'ok' ? 'Filed' : 'Filed (check)', St[lv]);
          }),
          XL.i(n),
        ]);
      });
      C.push([]);
    });
  out.push({ name: XL.name('Coverage', used), sheet: XL.sheet(C, [18, 18, ...GST.FY_MONTHS.map(() => 12), 9]) });

  // All GSTINs of each year side by side.
  Object.keys(fys)
    .sort()
    .forEach((fy) => {
      const gs = fys[fy];
      const rows = allRows(cfg.fields, gs, true);
      const A: XSheet['rows'] = [[XL.t(`${cfg.short} – all GSTINs – FY ${fy}`, St.title)], [XL.t('Year totals of the returns loaded (see Coverage for missing months).', St.sub)], []];
      A.push([...['Table', 'Particulars', 'Head'].map((h) => XL.t(h, St.headL)), ...gs.map((g) => XL.t(`${g.gstin}\n${g.state}`, St.head)), XL.t('Total', St.head)]);
      rows.forEach((r) => {
        const st = r.key === 'TL' ? St.tot : r.first ? St.bold : St.cell;
        const cnt = r.head === 'rec';
        A.push([
          XL.t(r.first ? r.tbl : '', st), XL.t(r.first ? r.label.trim() : '', st), XL.t(GST.HEADS[r.head], r.key === 'TL' ? St.tot : St.cell),
          ...r.vals.map((v: number | null) => (cnt ? XL.i(v, r.key === 'TL' ? St.tot : St.cell) : XL.n(v, r.key === 'TL' ? St.tot : St.cell))),
          cnt ? XL.i(r.total, St.tot) : XL.n(r.total, St.tot),
        ]);
      });
      const sheet = XL.sheet(A, [8, 56, 14, ...gs.map(() => 19), 19]);
      sheet.heights = { 3: 30 };
      out.push({ name: XL.name(`All GSTINs ${fy}`, used), sheet });
    });

  // One month-wise sheet per GSTIN and year.
  groups.forEach((g: any) => {
    const rows = GST.monthTable(cfg.fields, g, { hideZero: true });
    const M: XSheet['rows'] = [[XL.t(`${cfg.short} – ${g.gstin} – ${g.state} – FY ${g.fy}`, St.title)], [XL.t(`${g.legal || ''} · month-wise · – = return not loaded`, St.sub)], []];
    M.push([...['Table', 'Particulars', 'Head'].map((h) => XL.t(h, St.headL)), ...GST.FY_MONTHS.map((m: number) => XL.t(GST.monName(m), St.head)), XL.t('Total', St.head)]);
    rows.forEach((r: any) => {
      const st = r.key === 'TL' ? St.tot : r.first ? St.bold : St.cell;
      const cnt = r.head === 'rec';
      M.push([
        XL.t(r.first ? r.tbl : '', st), XL.t(r.first ? r.label.trim() : '', st), XL.t(GST.HEADS[r.head], r.key === 'TL' ? St.tot : St.cell),
        ...r.vals.map((v: number | null) => (cnt ? XL.i(v, r.key === 'TL' ? St.tot : St.cell) : XL.n(v, r.key === 'TL' ? St.tot : St.cell))),
        cnt ? XL.i(r.total, St.tot) : XL.n(r.total, St.tot),
      ]);
    });
    out.push({ name: XL.name(`${g.gstin.slice(0, 2)} ${g.state} ${g.fy.slice(2)}`, used), sheet: XL.sheet(M, [8, 56, 14, ...GST.FY_MONTHS.map(() => 15), 17]) });
  });

  if (cfg.extra) out.push(...cfg.extra(sorted, used));
  if (withDetail) {
    const D = cfg.detail(sorted);
    out.push({ name: XL.name('Detail', used), sheet: XL.sheet(D.rows, D.widths) });
  }
  const fyTxt = Object.keys(fys).sort().join('_');
  return { sheets: out, fileName: `${cfg.file}_FY${fyTxt}_${groups.length}GSTIN.xlsx` };
}

export function ReturnConverter({ cfg, props }: { cfg: ConverterConfig; props: ToolProps }) {
  const [rets, setRets] = useState<Ret[]>([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [hideZero, setHideZero] = useState(true);
  const [detail, setDetail] = useState(props.features.detailSheet !== false);
  const [sel, setSel] = useState('');

  const good = useMemo(() => rets.filter((r) => !r.error && r.type === cfg.type), [rets, cfg.type]);
  const gg = useMemo(() => GST.group(good), [good]);
  const groups: any[] = gg.list;
  const cur = groups.find((x) => `${x.gstin}|${x.fy}` === sel) ?? groups[0];
  const shared = sharedReturns(cfg.type).filter((r) => !rets.some((x) => sameRet(x, r)));

  const add = (list: Ret[]) => {
    const { list: next, skipped } = addReturns(rets, list);
    setRets(next);
    setNote(skipped ? `${skipped} file(s) were already in the list and were skipped.` : null);
  };

  const onFiles = async (files: File[]) => {
    const tooBig = files.map((f) => sizeProblem(f, props)).find(Boolean);
    const ok = files.filter((f) => !sizeProblem(f, props));
    const { rets: read, skipped } = await readReturns(ok, setBusy);
    setBusy('');
    add(read);
    if (skipped || tooBig) setNote([skipped ? `${skipped} file(s) were not PDFs and were skipped.` : '', tooBig ?? ''].filter(Boolean).join(' '));
  };

  const excel = async () => {
    setBusy('Building Excel…');
    try {
      const { sheets, fileName } = workbookSheets(cfg, good, detail);
      download(await buildWorkbook(sheets), fileName, XLSX_TYPE);
    } catch (e) {
      setNote(`Could not build the Excel file: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const nErr = rets.filter((r) => r.error).length;
  const nWarn = good.filter((r) => level(r) !== 'ok').length;

  return (
    <div className="space-y-5">
      <Drop
        accept=".pdf,application/pdf"
        title={`Drop ${cfg.short} PDF files here`}
        hint="Any number of GSTINs and months together. GSTIN and period are read from inside each PDF, so file names don't matter."
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
              <Chip>{good.length} {cfg.short}</Chip>
              {nWarn > 0 && <Chip tone="warn">{nWarn} with notes</Chip>}
              {nErr > 0 && <Chip tone="err">{nErr} not read</Chip>}
              <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={() => window.confirm('Remove all files from this list?') && setRets([])}>
                Clear all
              </button>
            </>
          }
        >
          <ReturnFiles rets={rets} expected={cfg.type} onRemove={(i) => setRets(rets.filter((_, k) => k !== i))} />
          {gg.dups.length > 0 && (
            <Notice tone="warn">
              {gg.dups.length} duplicate return{gg.dups.length > 1 ? 's' : ''} for the same GSTIN and month. The one with the latest ARN date is used: {gg.dups.map((d: Ret) => d.file).join(', ')}
            </Notice>
          )}
        </Section>
      )}

      {groups.length > 0 ? (
        <>
          <Section title="Returns by GSTIN and month" aside={<span className="text-[0.82rem] text-ink-3">✓ checked · ! check notes · – not loaded</span>}>
            <Coverage groups={groups} dups={gg.dups} />
          </Section>
          <Section
            title="Month-wise view"
            aside={
              <>
                <select aria-label="GSTIN and year" className="field !min-h-9 !w-auto !py-1" value={`${cur.gstin}|${cur.fy}`} onChange={(e) => setSel(e.target.value)}>
                  {groups.map((x) => (
                    <option key={`${x.gstin}|${x.fy}`} value={`${x.gstin}|${x.fy}`}>
                      {x.gstin} · {x.state} · FY {x.fy}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-[0.88rem]">
                  <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> Hide rows that are zero all year
                </label>
              </>
            }
          >
            <MonthTable rows={GST.monthTable(cfg.fields, cur, { hideZero })} />
          </Section>
          <Section
            title="Excel file"
            aside={
              <>
                {props.features.detailSheet !== false && (
                  <label className="flex items-center gap-2 text-[0.88rem]">
                    <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} /> Include detail sheet
                  </label>
                )}
                <button type="button" className="btn" disabled={!!busy} onClick={excel}>
                  Download Excel
                </button>
              </>
            }
          >
            <p className="text-[0.88rem] text-ink-3">{cfg.sheets}</p>
          </Section>
        </>
      ) : (
        !rets.length && (
          <Section title="How it works">
            <ol className="space-y-2">
              {cfg.how.map((t, i) => (
                <li key={t} className="grid grid-cols-[1.8rem_1fr] gap-2 text-ink-2">
                  <span className="display text-[1.2rem] leading-none text-signal">{i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
          </Section>
        )
      )}
    </div>
  );
}
