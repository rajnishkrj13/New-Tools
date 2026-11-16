'use client';

import { XL, type XSheet } from '@/lib/gst/excel';
import { GST, type Ret } from '@/lib/gst/helpers';
import type { ToolProps } from './kit';
import { ReturnConverter, type ConverterConfig } from './gst/ReturnConverter';

/* eslint-disable @typescript-eslint/no-explicit-any */

const CFG: ConverterConfig = {
  type: 'GSTR3B',
  short: 'GSTR-3B',
  file: 'GSTR-3B_Summary',
  fields: GST.G3_FIELDS,
  retCols: [
    ['3.1(a) taxable value', '3.1a', 'v'],
    ['3.1(a) IGST', '3.1a', 'i'],
    ['3.1(a) CGST', '3.1a', 'c'],
    ['3.1(a) SGST', '3.1a', 's'],
    ['Net ITC IGST', '4C', 'i'],
    ['Net ITC CGST', '4C', 'c'],
    ['Net ITC SGST', '4C', 's'],
    ['Cash paid IGST', '6.1A.cash', 'i'],
    ['Cash paid CGST', '6.1A.cash', 'c'],
    ['Cash paid SGST', '6.1A.cash', 's'],
  ],
  sheets: 'Returns list · coverage grid · all GSTINs for the year · one month-wise sheet per GSTIN · tax liability breakup · every figure of every return (detail).',
  how: [
    'Download GSTR-3B PDFs from the portal (Returns dashboard → GSTR-3B → Download filed GSTR-3B).',
    'Drop all of them here together: different GSTINs, months and years are sorted automatically.',
    'Check the coverage grid for missing months, then download one Excel file.',
  ],
  extra(rets: Ret[], used: Record<string, number>) {
    const S = XL.S;
    const R: XSheet['rows'] = [[XL.t('GSTR-3B – breakup of tax liability declared', S.title)], [XL.t('As printed at the end of each return (used for interest computation).', S.sub)], []];
    R.push(['GSTIN', 'State', 'FY', 'Return period', 'Liability period', 'IGST', 'CGST', 'SGST/UTGST', 'Cess', 'File'].map((h) => XL.t(h, S.headL)));
    rets.forEach((r) => (r.brk || []).forEach((b: any) => R.push([XL.t(r.gstin), XL.t(r.state), XL.t(r.fy), XL.t(r.periodText), XL.t(b.period), XL.n(b.i), XL.n(b.c), XL.n(b.s), XL.n(b.cs), XL.t(r.file)])));
    return [{ name: XL.name('Liability breakup', used), sheet: XL.sheet(R, [18, 14, 9, 13, 18, 15, 15, 15, 12, 36]) }];
  },
  detail(rets: Ret[]) {
    const S = XL.S;
    const R: XSheet['rows'] = [[XL.t('GSTR-3B – every figure of every return', S.title)], [XL.t('One row per table line. Filter by GSTIN, period or table for pivot tables.', S.sub)], []];
    R.push(['GSTIN', 'State', 'FY', 'Tax period', 'Table', 'Particulars', 'Taxable value', 'IGST', 'CGST', 'SGST/UTGST', 'Cess', 'Inter-State', 'Intra-State', 'Field', 'File'].map((h) => XL.t(h, S.headL)));
    rets.forEach((r) => {
      GST.G3_FIELDS.forEach((fd: any) => {
        const x = r.f[fd.key];
        if (!x) return;
        R.push([XL.t(r.gstin), XL.t(r.state), XL.t(r.fy), XL.t(r.periodText), XL.t(fd.tbl), XL.t(fd.label), XL.n(x.v), XL.n(x.i), XL.n(x.c), XL.n(x.s), XL.n(x.cs), XL.n(x.inter), XL.n(x.intra), XL.t(fd.key), XL.t(r.file)]);
      });
    });
    return { rows: R, widths: [18, 14, 9, 11, 9, 52, 16, 15, 15, 15, 12, 14, 14, 13, 36] };
  },
};

export default function Gstr3bToExcel(props: ToolProps) {
  return <ReturnConverter cfg={CFG} props={props} />;
}
