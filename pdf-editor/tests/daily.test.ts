import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, decodePDFRawStream } from 'pdf-lib';
import type { EditorObject } from '../src/types/objects';
import { exportPdf, pageInfoFromPdfLib } from '../src/engines/PdfExporter';
import { mergePdfs } from '../src/engines/PdfTools';
import { EMPTY_DETAILS, detailEntries, formatDate, matchDetailsToFields, plainFieldName, type Details } from '../src/engines/Profile';
import { setMeasureImpl } from '../src/utils/fontUtils';

setMeasureImpl((text, _font, size) => text.length * size * 0.5);

const SAMPLE = new Uint8Array(readFileSync(join(__dirname, '..', 'test-assets', 'sample.pdf')));

async function blank(pages: number, label: string, field?: string) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([300, 400]);
  doc.setTitle(label);
  if (field) doc.getForm().createTextField(field).addToPage(doc.getPage(0), { x: 20, y: 20, width: 150, height: 20 });
  return doc.save();
}

describe('combining files', () => {
  it('keeps every page, in the order given', async () => {
    const a = await blank(2, 'A');
    const sample = await PDFDocument.load(SAMPLE);
    const b = await blank(1, 'B');
    const { bytes, counts } = await mergePdfs([a, SAMPLE, b]);
    expect(counts).toEqual([2, sample.getPageCount(), 1]);
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(3 + sample.getPageCount());
  });

  it('keeps form fields fillable', async () => {
    const one = await blank(1, 'one', 'applicant');
    const two = await blank(1, 'two', 'reference');
    const { bytes } = await mergePdfs([one, two]);
    const form = (await PDFDocument.load(bytes)).getForm();
    const names = form.getFields().map((f) => f.getName()).sort();
    expect(names).toEqual(['applicant', 'reference']);
    form.getTextField('reference').setText('R-17');
    expect(form.getTextField('reference').getText()).toBe('R-17');
  });
});

describe('saved details', () => {
  const me: Details = {
    ...EMPTY_DETAILS,
    fullName: 'Asha Rani Verma',
    email: 'asha@example.com',
    phone: '+91 98100 00000',
    company: 'Verma Traders',
    address: '12 MG Road\nSector 4',
    city: 'Delhi',
    postcode: '110001',
    country: 'India',
    custom: [{ label: 'Customer ID', value: 'C-0042' }],
  };

  it('reads field names the way people write them', () => {
    expect(plainFieldName('form1[0].page1[0].FirstName[0]')).toBe('first name');
    expect(plainFieldName('applicant_email')).toBe('applicant email');
    expect(plainFieldName('Address2')).toBe('address 2');
  });

  it('fills the fields that clearly ask for a saved detail', () => {
    const fields = [
      'Full Name', 'FirstName', 'last_name', 'E-mail', 'Mobile', 'Company Name', 'Address', 'Address2', 'City', 'PIN Code', 'Country',
      "Father's Name", 'Fathers Name', 'Nominee Name', 'Customer ID', 'Signature date', 'Amount',
    ].map((name) => ({ name, kind: 'text' }));
    const got = matchDetailsToFields([...fields, { name: 'agree', kind: 'checkbox' }], me);
    expect(got).toEqual({
      'Full Name': 'Asha Rani Verma',
      FirstName: 'Asha',
      last_name: 'Rani Verma',
      'E-mail': 'asha@example.com',
      Mobile: '+91 98100 00000',
      'Company Name': 'Verma Traders',
      Address: '12 MG Road, Sector 4',
      City: 'Delhi',
      'PIN Code': '110001',
      Country: 'India',
      'Customer ID': 'C-0042',
    });
  });

  it('leaves out details that were never saved', () => {
    const got = matchDetailsToFields([{ name: 'email', kind: 'text' }, { name: 'name', kind: 'text' }], { ...EMPTY_DETAILS, fullName: 'Ravi' });
    expect(got).toEqual({ name: 'Ravi' });
    expect(detailEntries({ ...EMPTY_DETAILS, fullName: 'Ravi' }).map((d) => d.value)).toEqual(['Ravi']);
  });

  it('writes today in the chosen style', () => {
    const d = new Date(2026, 10, 6);
    expect(formatDate(d, 'dmy-slash')).toBe('06/11/2026');
    expect(formatDate(d, 'dmy-dash')).toBe('06-11-2026');
    expect(formatDate(d, 'dmy-long')).toBe('6 November 2026');
    expect(formatDate(d, 'mdy-long')).toBe('November 6, 2026');
    expect(formatDate(d, 'iso')).toBe('2026-11-06');
  });
});

describe('tick and cross marks', () => {
  it('are drawn into the page as vector strokes', async () => {
    const doc = await PDFDocument.load(SAMPLE);
    const pages = [pageInfoFromPdfLib(doc.getPage(0), 0)];
    const mark = (id: string, kind: 'check' | 'cross' | 'dot', x: number): EditorObject => ({
      id, pageIndex: 0, type: 'mark', mark: kind, x, y: 100, width: 12, height: 12, color: '#b91c1c', strokeWidth: 1.6, opacity: 1,
    });
    const result = await exportPdf({ bytes: SAMPLE, pages, objects: [mark('a', 'check', 50), mark('b', 'cross', 80), mark('c', 'dot', 110)], assets: {} });
    const out = await PDFDocument.load(result.bytes);
    expect(out.getPageCount()).toBe(1);
    const contents = out.getPage(0).node.Contents() as any;
    const stream = contents.asArray().map((r: any) => new TextDecoder().decode(decodePDFRawStream(out.context.lookup(r) as any).decode())).join('\n');
    // Red strokes with round caps (the tick and the cross) and a filled dot.
    expect(stream).toMatch(/0\.7\d* 0\.1\d* 0\.1\d* RG/);
    expect(stream).toMatch(/\b1 J\b/);
    expect(stream).toMatch(/\bS\b/);
    expect(stream).toMatch(/\bf\b/);
  });
});
