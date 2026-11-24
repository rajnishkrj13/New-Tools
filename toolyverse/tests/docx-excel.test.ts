import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { readDocx } from '../src/lib/docx/read';
import { tablesWorkbook } from '../src/lib/tables/xlsx';
import { mainScripts, isRtl, modelsFor, LANGUAGES } from '../src/lib/lang';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const p = (text: string, extra = '') => `<w:p>${extra}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const tc = (inner: string, pr = '') => `<w:tc>${pr ? `<w:tcPr>${pr}</w:tcPr>` : ''}${inner}</w:tc>`;

async function docx(body: string): Promise<Uint8Array> {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  z.file('word/document.xml', `<w:document ${NS}><w:body>${body}</w:body></w:document>`);
  z.file('word/styles.xml', `<w:styles ${NS}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`);
  z.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/inv/7" TargetMode="External"/></Relationships>');
  z.file('word/numbering.xml', `<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`);
  return new Uint8Array(await z.generateAsync({ type: 'uint8array' }));
}

describe('Word tables', () => {
  it('reads merged cells, nested tables, links, headings and Indian scripts exactly', async () => {
    const nested = `<w:tbl><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid><w:tr>${tc(p('a'))}${tc(p('b'))}</w:tr></w:tbl>`;
    const body = [
      p('विक्रय रिपोर्ट', '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'),
      p('First point', '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>'),
      '<w:tbl><w:tblGrid><w:gridCol/><w:gridCol/><w:gridCol/></w:tblGrid>',
      `<w:tr><w:trPr><w:tblHeader/></w:trPr>${tc(p('बिल संख्या'))}${tc(p('राशि'), '<w:gridSpan w:val="2"/>')}</w:tr>`,
      `<w:tr>${tc(p('INV-007'), '<w:vMerge w:val="restart"/>')}${tc('<w:p><w:hyperlink r:id="rId9"><w:r><w:t>1,250.00</w:t></w:r></w:hyperlink></w:p>')}${tc(p('اردو متن'))}</w:tr>`,
      `<w:tr>${tc('<w:p/>', '<w:vMerge/>')}${tc(`<w:p><w:r><w:t>line 1</w:t><w:br/><w:t>line 2</w:t></w:r><w:del><w:r><w:delText>gone</w:delText></w:r></w:del></w:p>`)}${tc(nested)}</w:tr>`,
      '</w:tbl>',
    ].join('');
    const r = await readDocx(await docx(body));
    expect(r.blocks).toEqual([
      { kind: 'heading', level: 1, text: 'विक्रय रिपोर्ट' },
      { kind: 'list', level: 1, list: 'bullet', text: 'First point' },
    ]);
    expect(r.tables).toHaveLength(2);
    const t = r.tables[0];
    expect(t.rows.map((row) => row.map((c) => (c.hidden ? '·' : c.text)))).toEqual([
      ['बिल संख्या', 'राशि', '·'],
      ['INV-007', '1,250.00', 'اردو متن'],
      ['·', 'line 1\nline 2', '[Table 2 (inside a table)]'],
    ]);
    expect(t.rows[0][1].colSpan).toBe(2);
    expect(t.rows[1][0].rowSpan).toBe(2);
    expect(t.rows[1][1].link).toBe('https://example.com/inv/7');
    expect(t.headerRows).toBe(1);
    expect(r.tables[1].rows.map((row) => row.map((c) => c.text))).toEqual([['a', 'b']]);
  });

  it('refuses old .doc and broken files with a clear reason', async () => {
    await expect(readDocx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).rejects.toThrow(/old \.doc/);
    await expect(readDocx(new Uint8Array([1, 2, 3]))).rejects.toThrow(/not a Word/);
    await expect(readDocx(new Uint8Array([0x50, 0x4b, 3, 4, 9, 9]))).rejects.toThrow(/damaged/);
  });
});

describe('Excel output', () => {
  it('writes numbers, dates, text identifiers, merges and the report', async () => {
    const r = await readDocx(
      await docx(
        `<w:tbl><w:tblGrid><w:gridCol/><w:gridCol/><w:gridCol/><w:gridCol/></w:tblGrid>
        <w:tr>${tc(p('Invoice No'))}${tc(p('Date'))}${tc(p('GSTIN'))}${tc(p('Amount'))}</w:tr>
        <w:tr>${tc(p('000123'))}${tc(p('05/04/2026'))}${tc(p('27AAPFU0939F1ZV'))}${tc(p('1,25,000.50'))}</w:tr>
        <w:tr>${tc(p('000124'))}${tc(p('06/04/2026'))}${tc(p('27AAPFU0939F1ZV'))}${tc(p('(250.00)'))}</w:tr>
        <w:tr>${tc(p('Total'), '<w:gridSpan w:val="3"/>')}${tc(p('1,24,750.50'))}</w:tr></w:tbl>`,
      ),
    );
    const t = r.tables[0];
    t.name = 'Invoices';
    const { bytes, findings } = await tablesWorkbook([{ table: t, sheet: 'Invoices' }], { typed: true, mark: true, report: true, source: 'test.docx' });
    expect(findings.get(t.id)!.some((f) => f.level === 'ok' && /total/.test(f.message))).toBe(true);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Invoices', 'Extraction report']);
    const ws = wb.getWorksheet('Invoices')!;
    expect(ws.getCell('A2').value).toBe('000123');
    expect(ws.getCell('B2').value).toEqual(new Date(Date.UTC(2026, 3, 5)));
    expect(ws.getCell('C2').value).toBe('27AAPFU0939F1ZV');
    expect(ws.getCell('D2').value).toBe(125000.5);
    expect(ws.getCell('D3').value).toBe(-250);
    expect(ws.getCell('D3').numFmt).toBe('#,##0.00;(#,##0.00)');
    expect(ws.getCell('A4').isMerged).toBe(true);
    expect(ws.getCell('D4').value).toBe(124750.5);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  });
});

describe('languages', () => {
  it('detects scripts, right-to-left text and OCR models without translating anything', () => {
    expect(mainScripts('Invoice बिल संख्या ১২৩ বিল')).toEqual(['Devanagari', 'Latin', 'Bengali']);
    expect(mainScripts('ᱥᱟᱱᱛᱟᱲᱤ ꯃꯩꯇꯩꯂꯣꯟ')).toEqual(['OlChiki', 'MeeteiMayek']);
    expect(isRtl('اردو متن 123')).toBe(true);
    expect(isRtl('Hindi हिन्दी')).toBe(false);
    expect(modelsFor(['ta', 'ur', 'sat'])).toMatchObject({ models: ['eng', 'tam', 'urd'] });
    expect(modelsFor(['sat']).unreadable.map((l) => l.name)).toEqual(['Santali']);
    expect(LANGUAGES).toHaveLength(23);
  });
});
