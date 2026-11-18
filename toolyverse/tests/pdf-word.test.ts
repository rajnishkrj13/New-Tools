import { describe, expect, it } from 'vitest';
import { buildLines, layoutPage, wordFont, type PageIn, type Span } from '../src/lib/pdf/word/layout';
import { buildDocx } from '../src/lib/pdf/word/docx';

const A4 = { width: 595, height: 842 };

/** Pieces of text the way pdf.js gives them: roughly 0.5 em per character. */
function words(text: string, x: number, y: number, size = 11, extra: Partial<Span> = {}): Span[] {
  return [{ str: text, x, y, w: text.length * size * 0.5, size, font: 'Arial', bold: false, italic: false, ...extra }];
}

/** A paragraph wrapped over several lines of a 72–523 pt column. */
function paragraph(lines: string[], top: number, size = 11, lead = 14): Span[] {
  return lines.flatMap((l, i) => words(l, 72, top + i * lead, size));
}

const unzip = (bytes: Uint8Array) => {
  // Stored (uncompressed) zip: walk local headers.
  const files: Record<string, string> = {};
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  while (dv.getUint32(o, true) === 0x04034b50) {
    const size = dv.getUint32(o + 18, true);
    const nameLen = dv.getUint16(o + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(o + 30, o + 30 + nameLen));
    files[name] = new TextDecoder().decode(bytes.subarray(o + 30 + nameLen, o + 30 + nameLen + size));
    o += 30 + nameLen + size;
  }
  return files;
};

describe('lines', () => {
  it('joins pieces on one baseline and adds missing spaces', () => {
    const lines = buildLines([...words('Hello', 72, 100), ...words('world', 72 + 27.5 + 3, 100.4), ...words('next', 72, 114)]);
    expect(lines).toHaveLength(2);
    expect(lines[0].segs[0].runs.map((r) => r.text).join('')).toBe('Hello world');
  });

  it('splits a line into columns at wide gaps', () => {
    const lines = buildLines([...words('Date', 72, 100), ...words('Narration', 160, 100), ...words('1,250.00', 460, 100)]);
    expect(lines[0].segs).toHaveLength(3);
  });

  it('sees columns through the wide space pieces pdf.js puts in gaps', () => {
    const gap: Span = { str: ' ', x: 122, y: 100, w: 28, size: 10, font: 'Arial', bold: false, italic: false };
    const lines = buildLines([...words('01/04/2026', 72, 100, 10), gap, ...words('Opening', 150, 100, 10)]);
    expect(lines[0].segs).toHaveLength(2);
  });
});

describe('layout', () => {
  const full = 'x'.repeat(82); // 82 × 5.5 = 451 pt: reaches the right edge of the column

  it('joins wrapped lines into one paragraph and keeps separate paragraphs apart', () => {
    const page: PageIn = { ...A4, images: [], spans: [...paragraph([full, full, 'end of first.'], 100), ...paragraph([full, 'second.'], 160)] };
    const out = layoutPage(page);
    expect(out.paras).toHaveLength(2);
    expect(out.paras[0].runs[0].text).toBe(`${full} ${full} end of first.`);
    expect(out.paras[0].line).toBeCloseTo(14, 0);
    expect(out.paras[1].before).toBeGreaterThan(10);
    expect(out.paras[0].align).toBe('both');
    expect(out.paras[1].align).toBe('left');
  });

  it('keeps text colour on its runs', () => {
    const spans = [...words('Blue title', 72, 90, 18, { color: '1A3380' }), ...words('black text', 72, 120)];
    const out = layoutPage({ ...A4, images: [], spans });
    expect(out.paras[0].runs[0].color).toBe('1A3380');
    expect(out.paras[1].runs[0].color).toBeUndefined();
  });

  it('does not join a short line to the next one', () => {
    const page: PageIn = { ...A4, images: [], spans: [...words('Name: Asha', 72, 100), ...words(full, 72, 114)] };
    expect(layoutPage(page).paras).toHaveLength(2);
  });

  it('starts a new paragraph at a bullet', () => {
    const page: PageIn = { ...A4, images: [], spans: [...words(full, 72, 100), ...words('• second item', 72, 114), ...words('• third item', 72, 128)] };
    expect(layoutPage(page).paras).toHaveLength(3);
  });

  it('finds centred and right-aligned lines', () => {
    const spans = [...words(full, 72, 80), ...words('TAX INVOICE', 297.5 - 30.25, 100), ...words('Page 1', 523 - 33, 130)];
    const out = layoutPage({ ...A4, images: [], spans });
    expect(out.paras[1].align).toBe('center');
    expect(out.paras[2].align).toBe('right');
  });

  it('turns table rows into tab stops with amounts right-aligned', () => {
    const spans = [...words(full, 72, 80), ...words('01/04/2026', 72, 100), ...words('UPI/Grocery', 160, 100), ...words('1,250.00', 479, 100)];
    const out = layoutPage({ ...A4, images: [], spans });
    const row = out.paras[1];
    expect(row.tabs).toEqual([
      { pos: 88, align: 'left' },
      { pos: expect.closeTo(451, 0), align: 'right' },
    ]);
    expect(row.runs.filter((r) => r.tab)).toHaveLength(2);
  });

  it('marks big short lines as headings', () => {
    const spans = [...words('Annual Report', 72, 90, 24), ...paragraph([full, full], 130)];
    const out = layoutPage({ ...A4, images: [], spans }, 11);
    expect(out.paras[0].heading).toBe(1);
    expect(out.paras[1].heading).toBeUndefined();
  });
});

describe('fonts', () => {
  it('maps PDF font names to Word font names', () => {
    expect(wordFont('ABCDEF+TimesNewRomanPS-BoldMT')).toEqual({ family: 'Times New Roman', bold: true, italic: false });
    expect(wordFont('ArialMT')).toEqual({ family: 'Arial', bold: false, italic: false });
    expect(wordFont('Helvetica-Oblique')).toEqual({ family: 'Arial', bold: false, italic: true });
    expect(wordFont('CourierNewPSMT').family).toBe('Courier New');
    expect(wordFont('Calibri-Bold').family).toBe('Calibri');
    expect(wordFont('T1_0', 'serif').family).toBe('Times New Roman');
    expect(wordFont('', 'monospace').family).toBe('Courier New');
  });
});

describe('docx', () => {
  it('writes a valid Word package with sections, tabs and pictures', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const p1 = layoutPage({ ...A4, images: [{ x: 72, y: 40, w: 100, h: 30, bytes: png, type: 'png' }], spans: [...words('Tom & Jerry <3', 72, 100), ...words('a', 72, 130), ...words('9.00', 500, 130)] });
    const p2 = layoutPage({ width: 842, height: 595, images: [], spans: words('Landscape', 72, 100) });
    const files = unzip(buildDocx([p1, p2], { title: 'Test' }));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels', 'word/media/image1.png']));
    const doc = files['word/document.xml'];
    expect(doc).toContain('Tom &amp; Jerry &lt;3');
    expect(doc.match(/<w:sectPr>/g)).toHaveLength(2);
    expect(doc).toContain('w:orient="landscape"');
    expect(doc).toContain('<w:tab w:val="right"');
    expect(doc).toContain('r:embed="rIdImg1"');
    expect(files['word/_rels/document.xml.rels']).toContain('media/image1.png');
    // Balanced tags: every <w:p> closes.
    expect(doc.match(/<w:p>/g)!.length).toBe(doc.match(/<\/w:p>/g)!.length);
  });

  it('drops characters XML cannot hold', () => {
    const p = layoutPage({ ...A4, images: [], spans: words('a\u0001b￿c', 72, 100) });
    expect(unzip(buildDocx([p]))['word/document.xml']).toContain('>abc<');
  });
});
