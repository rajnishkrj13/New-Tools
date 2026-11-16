/**
 * Helpers shared by the GST return tools, ported from the GST Toolkit's "gstui" library, and
 * the store that lets returns read in one tool be used in the others.
 */
import GST from './core';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Ret = any;
export type Check = { lvl: 'ok' | 'warn' | 'err'; msg: string };

export const r2 = (x: number | null | undefined) => (x == null ? null : Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100);

/** 1234567.5 → "12,34,567.50" (Indian grouping). */
export function fmt(n: number | null | undefined, dec = 2): string {
  if (n == null || isNaN(n)) return '';
  const neg = n < 0;
  const [w0, f] = Math.abs(n).toFixed(dec).split('.');
  const w = w0.length > 3 ? `${w0.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${w0.slice(-3)}` : w0;
  return (neg ? '-' : '') + w + (dec ? `.${f}` : '');
}

export const checksOf = (r: Ret): Check[] => (r.checks || []).concat((r.warn || []).map((w: string) => ({ lvl: 'warn', msg: w })));

export function level(r: Ret): 'ok' | 'warn' | 'err' {
  if (r.error) return 'err';
  const c = checksOf(r);
  return c.some((x) => x.lvl === 'err') ? 'err' : c.some((x) => x.lvl === 'warn') ? 'warn' : 'ok';
}

export const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

export const sameRet = (a: Ret, b: Ret) => a.key && b.key && a.key === b.key && (a.arn || '') === (b.arn || '');

/** Adds returns to a list, skipping the same file or the same return again. Returns how many were skipped. */
export function addReturns(list: Ret[], add: Ret[]): { list: Ret[]; skipped: number } {
  const out = list.slice();
  let skipped = 0;
  for (const r of add) {
    if (out.some((x) => (x.file === r.file && !r.key) || (r.key && sameRet(x, r)))) {
      skipped++;
      continue;
    }
    out.push(r);
  }
  return { list: out, skipped };
}

export const retSort = (a: Ret, b: Ret) =>
  a.gstin < b.gstin ? -1 : a.gstin > b.gstin ? 1 : a.fy < b.fy ? -1 : a.fy > b.fy ? 1 : GST.fyIndex(a.month) - GST.fyIndex(b.month);

/** All GSTINs of one FY: rows = field × head, columns = GSTINs (year totals). */
export function allRows(fields: any[], groups: any[], hideZero: boolean) {
  let rows: any[] = [];
  fields.forEach((fd) => {
    fd.heads.forEach((h: string, hi: number) => {
      const vals = groups.map((g) => {
        let t = 0;
        let any = false;
        GST.FY_MONTHS.forEach((m: number) => {
          const r = g.months[m];
          if (r && r.f[fd.key] && r.f[fd.key][h] != null) {
            t += r.f[fd.key][h];
            any = true;
          }
        });
        return any ? r2(t) : null;
      });
      rows.push({ key: fd.key, tbl: fd.tbl, label: fd.label, head: h, first: hi === 0, vals, total: r2(vals.reduce((t: number, v: number | null) => t + (v || 0), 0)), nz: vals.some((v: number | null) => v), keep: fd.keep });
    });
  });
  if (hideZero) {
    const live: Record<string, 1> = {};
    rows.forEach((r) => {
      if (r.nz || r.keep) live[r.key] = 1;
    });
    rows = rows.filter((r) => live[r.key]);
    rows.forEach((r, i) => (r.first = i === 0 || rows[i - 1].key !== r.key));
  }
  return rows;
}

/** Reads PDFs one by one, reporting progress. Good returns are also shared with the other GST tools. */
export async function readReturns(files: File[], onProgress: (msg: string) => void): Promise<{ rets: Ret[]; skipped: number }> {
  const list = files.filter((f) => /\.pdf$/i.test(f.name));
  const rets: Ret[] = [];
  for (const [i, f] of list.entries()) {
    onProgress(`Reading ${i + 1} of ${list.length}: ${f.name}`);
    try {
      const r = await GST.readFile(f);
      r.file = r.file || f.name;
      rets.push(r);
      shareReturn(r);
    } catch (e) {
      rets.push({ error: String((e as Error)?.message || e), file: f.name });
    }
  }
  return { rets, skipped: files.length - list.length };
}

// ---- returns shared between the GST tools (for this visit, in memory only) -----------------------

const shared = new Map<string, Ret>();
export function shareReturn(r: Ret) {
  if (r && r.key && !r.error) shared.set(`${r.key}|${r.arn || r.file}`, r);
}
export const sharedReturns = (type?: 'GSTR1' | 'GSTR3B') => [...shared.values()].filter((r) => !type || r.type === type);

export { GST };
