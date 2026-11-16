'use client';

import { XL } from '@/lib/gst/excel';
import { GST, type Ret } from '@/lib/gst/helpers';
import type { ToolProps } from './kit';
import { ReturnConverter, type ConverterConfig } from './gst/ReturnConverter';

const CFG: ConverterConfig = {
  type: 'GSTR1',
  short: 'GSTR-1',
  file: 'GSTR-1_Summary',
  fields: GST.G1_FIELDS,
  retCols: [
    ['Total liability – value', 'TL', 'v'],
    ['IGST', 'TL', 'i'],
    ['CGST', 'TL', 'c'],
    ['SGST/UTGST', 'TL', 's'],
    ['Cess', 'TL', 'cs'],
  ],
  sheets: 'Returns list · coverage grid · all GSTINs for the year · one month-wise sheet per GSTIN · every line of every return (detail).',
  how: [
    'Download GSTR-1 PDFs from the portal (Returns dashboard → GSTR-1 → View → Download PDF).',
    'Drop all of them here together: different GSTINs, months and years are sorted automatically.',
    'Check the coverage grid for missing months, then download one Excel file.',
  ],
  detail(rets: Ret[]) {
    const S = XL.S;
    const R = [[XL.t('GSTR-1 – every line of every return', S.title)], [XL.t('Filter this sheet by GSTIN, period or table for pivot tables.', S.sub)], []];
    R.push(['GSTIN', 'State', 'FY', 'Tax period', 'Table', 'Section', 'Sub-section', 'Row', 'No. of records', 'Document type', 'Value', 'IGST', 'CGST', 'SGST/UTGST', 'Cess', 'Field', 'File'].map((h) => XL.t(h, S.headL)));
    rets.forEach((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.rows.forEach((x: any) => {
        R.push([XL.t(r.gstin), XL.t(r.state), XL.t(r.fy), XL.t(r.periodText), XL.t(x.code), XL.t(x.title), XL.t(x.sub), XL.t(x.label), XL.i(x.rec), XL.t(x.doc), XL.n(x.v), XL.n(x.i), XL.n(x.c), XL.n(x.s), XL.n(x.cs), XL.t(x.field || ''), XL.t(r.file)]);
      });
    });
    return { rows: R, widths: [18, 14, 9, 11, 9, 50, 40, 44, 10, 13, 16, 15, 15, 15, 12, 14, 36] };
  },
};

export default function Gstr1ToExcel(props: ToolProps) {
  return <ReturnConverter cfg={CFG} props={props} />;
}
