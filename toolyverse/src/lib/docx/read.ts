/**
 * Reads a Word file (.docx): every table with its merged cells (across columns and down rows),
 * nested tables, heading rows, links and line breaks inside cells, and, for an optional sheet,
 * the headings, paragraphs and list items outside tables. Text is taken exactly as written in any
 * script; nothing is translated. Deleted text (tracked changes) and field codes are left out.
 */
import { child, children, parseXml, type XNode } from '../xml';
import { headerCount } from '../tables/detect';
import { cell, type Cell, type Table } from '../tables/types';

export interface TextBlock {
  kind: 'heading' | 'paragraph' | 'list';
  /** Heading level 1–9 or list level 1–9. */
  level: number;
  /** Bullet or numbered, for list items. */
  list?: 'bullet' | 'number';
  text: string;
}

export interface DocxRead {
  tables: Table[];
  blocks: TextBlock[];
}

const W = (n: XNode | undefined, name: string) => child(n, `w:${name}`);
const Ws = (n: XNode | undefined, name: string) => children(n, `w:${name}`);
const attr = (n: XNode | undefined, name: string) => n?.attrs[`w:${name}`] ?? n?.attrs[name];

export async function readDocx(bytes: Uint8Array): Promise<DocxRead> {
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error('This is an old .doc file or a password-protected Word file. Open it in Word and save it as .docx (without a password), then try again.');
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('This file is not a Word .docx document.');
  const JSZip = (await import('jszip')).default;
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error('This Word file is damaged and cannot be opened.');
  }
  const read = async (path: string) => {
    const f = zip.file(path);
    return f ? (parseXml(await f.async('string')).root ?? undefined) : undefined;
  };
  const doc = await read('word/document.xml');
  if (!doc) throw new Error('This .docx file has no document inside it. It may be damaged, or be a different kind of file renamed to .docx.');

  // Style names ("heading 1") by id, links by relationship id, list kinds by numbering id.
  const styles = new Map<string, string>();
  for (const s of Ws(await read('word/styles.xml'), 'style')) styles.set(attr(s, 'styleId') ?? '', attr(W(s, 'name'), 'val') ?? '');
  const links = new Map<string, string>();
  for (const r of children(await read('word/_rels/document.xml.rels'), 'Relationship')) if (/hyperlink$/.test(r.attrs.Type ?? '')) links.set(r.attrs.Id, r.attrs.Target);
  const numbering = await read('word/numbering.xml');
  const abstractFmt = new Map<string, string>();
  for (const a of Ws(numbering, 'abstractNum')) abstractFmt.set(attr(a, 'abstractNumId') ?? '', attr(W(Ws(a, 'lvl')[0], 'numFmt'), 'val') ?? '');
  const numFmt = new Map<string, string>();
  for (const n of Ws(numbering, 'num')) numFmt.set(attr(n, 'numId') ?? '', abstractFmt.get(attr(W(n, 'abstractNumId'), 'val') ?? '') ?? '');

  const tables: Table[] = [];
  const blocks: TextBlock[] = [];

  /** Text of a paragraph (or run container), in order, with tabs and line breaks. */
  const textOf = (n: XNode): { text: string; bold: boolean; link?: string } => {
    let text = '';
    let runs = 0;
    let boldRuns = 0;
    let link: string | undefined;
    const walk = (x: XNode, inLink?: string) => {
      for (const c of x.children) {
        const name = c.name;
        if (name === 'w:del' || name === 'w:delText' || name === 'w:instrText' || name === 'w:tbl') continue;
        if (name === 'w:t') text += c.text;
        else if (name === 'w:tab' || name === 'w:ptab') text += '\t';
        else if (name === 'w:br' || name === 'w:cr') text += '\n';
        else if (name === 'w:noBreakHyphen') text += '-';
        else if (name === 'w:softHyphen') continue;
        else if (name === 'w:sym') {
          const code = parseInt(attr(c, 'char') ?? '', 16);
          if (code) text += String.fromCodePoint(code >= 0xf000 ? code - 0xf000 : code);
        } else if (name === 'w:hyperlink') {
          const id = c.attrs['r:id'];
          const target = id ? links.get(id) : attr(c, 'anchor') ? `#${attr(c, 'anchor')}` : undefined;
          if (target && !link) link = target;
          walk(c, target);
        } else if (name === 'w:r') {
          const rpr = W(c, 'rPr');
          const b = W(rpr, 'b');
          const isText = c.children.some((k) => k.name === 'w:t' && k.text.trim());
          if (isText) {
            runs++;
            if (b && attr(b, 'val') !== '0' && attr(b, 'val') !== 'false') boldRuns++;
          }
          walk(c, inLink);
        } else walk(c, inLink);
      }
    };
    walk(n);
    return { text, bold: runs > 0 && boldRuns === runs, link };
  };

  const paragraphBlock = (p: XNode) => {
    const { text } = textOf(p);
    if (!text.trim()) return;
    const ppr = W(p, 'pPr');
    const style = styles.get(attr(W(ppr, 'pStyle'), 'val') ?? '') ?? '';
    const h = /^heading\s*(\d)$/i.exec(style) ?? (/^title$/i.test(style) ? ['', '1'] : null);
    const num = W(ppr, 'numPr');
    if (h) blocks.push({ kind: 'heading', level: Number(h[1]), text });
    else if (num) {
      const fmt = numFmt.get(attr(W(num, 'numId'), 'val') ?? '') ?? '';
      blocks.push({ kind: 'list', level: Number(attr(W(num, 'ilvl'), 'val') ?? 0) + 1, list: fmt === 'bullet' ? 'bullet' : 'number', text });
    } else blocks.push({ kind: 'paragraph', level: 0, text });
  };

  const tableOf = (tbl: XNode, depth: number): Table => {
    const id = `t${tables.length + 1}`;
    const placeholder: Table = { id, name: '', pages: [0], box: { x0: 0, y0: 0, x1: 0, y1: 0 }, rows: [], headerRows: 0, method: 'word', confidence: { table: 100, rows: 100, cols: 100, cells: 100 }, notes: [] };
    tables.push(placeholder);
    const gridCols = Ws(W(tbl, 'tblGrid'), 'gridCol').length;
    const trs = Ws(tbl, 'tr');
    const raw: { cells: { c: Cell; col: number; span: number; vm: 'restart' | 'continue' | null }[]; header: boolean; before: number }[] = [];
    let width = gridCols;
    for (const tr of trs) {
      const trPr = W(tr, 'trPr');
      const before = Number(attr(W(trPr, 'gridBefore'), 'val') ?? 0);
      let col = before;
      const cells: (typeof raw)[number]['cells'] = [];
      // Cells may sit inside content controls (w:sdt); take them in order.
      const tcs: XNode[] = [];
      const collect = (x: XNode) => {
        for (const c of x.children) {
          if (c.name === 'w:tc') tcs.push(c);
          else if (c.name === 'w:sdt' || c.name === 'w:sdtContent' || c.name === 'w:customXml') collect(c);
        }
      };
      collect(tr);
      for (const tc of tcs) {
        const tcPr = W(tc, 'tcPr');
        const span = Math.max(1, Number(attr(W(tcPr, 'gridSpan'), 'val') ?? 1));
        const vmNode = W(tcPr, 'vMerge');
        const vm = vmNode ? (attr(vmNode, 'val') === 'restart' ? 'restart' : 'continue') : null;
        const parts: string[] = [];
        let bold = true;
        let any = false;
        let link: string | undefined;
        for (const k of tc.children) {
          if (k.name === 'w:p') {
            const t = textOf(k);
            parts.push(t.text);
            if (t.text.trim()) {
              any = true;
              bold = bold && t.bold;
            }
            link = link ?? t.link;
          } else if (k.name === 'w:tbl') {
            const nested = tableOf(k, depth + 1);
            parts.push(`[${nested.name}]`);
            any = true;
          }
        }
        const text = parts.join('\n').replace(/\n+$/, '');
        cells.push({ c: cell(text, { bold: any && bold, link, colSpan: span }), col, span, vm });
        col += span;
      }
      width = Math.max(width, col + Number(attr(W(trPr, 'gridAfter'), 'val') ?? 0));
      raw.push({ cells, header: !!W(trPr, 'tblHeader'), before });
    }

    // Lay the cells on the grid; a cell continuing a vertical merge adds to the one above.
    const rows: Cell[][] = raw.map(() => Array.from({ length: width }, () => cell('')));
    raw.forEach((r, ri) => {
      for (const { c, col, span, vm } of r.cells) {
        if (col >= width) continue;
        if (vm === 'continue' && ri > 0) {
          // Find the cell this one continues: the nearest visible cell above in the same column.
          let up = ri - 1;
          while (up > 0 && rows[up][col].hidden) up--;
          const anchor = rows[up][col];
          if (!anchor.hidden) {
            anchor.rowSpan = ri - up + 1;
            for (let k = col; k < Math.min(width, col + span); k++) rows[ri][k] = cell('', { hidden: true });
            if (c.text.trim()) anchor.text = anchor.text ? `${anchor.text}\n${c.text}` : c.text;
            continue;
          }
        }
        rows[ri][col] = { ...c, colSpan: Math.min(span, width - col) };
        for (let k = col + 1; k < Math.min(width, col + span); k++) rows[ri][k] = cell('', { hidden: true });
      }
    });
    const marked = raw.findIndex((r) => !r.header);
    placeholder.rows = rows;
    placeholder.headerRows = marked > 0 ? marked : rows.length > 1 && rows[0].every((c) => c.hidden || !c.text || c.bold) ? 1 : headerCount(rows);
    placeholder.name = depth ? `Table ${tables.indexOf(placeholder) + 1} (inside a table)` : `Table ${tables.indexOf(placeholder) + 1}`;
    if (depth) placeholder.notes.push('This table sits inside a cell of another table.');
    if (raw.some((r) => r.before)) placeholder.notes.push('Some rows start further right in Word (skipped grid cells); those cells are left blank.');
    return placeholder;
  };

  const body = W(doc, 'body');
  const walkBody = (n: XNode | undefined) => {
    for (const c of n?.children ?? []) {
      if (c.name === 'w:p') paragraphBlock(c);
      else if (c.name === 'w:tbl') tableOf(c, 0);
      else if (c.name === 'w:sdt' || c.name === 'w:sdtContent' || c.name === 'w:customXml') walkBody(c);
    }
  };
  walkBody(body);
  // Number tables in document order (nested ones were numbered as they were met).
  tables.forEach((t, k) => {
    t.id = `t${k + 1}`;
  });
  return { tables, blocks };
}
