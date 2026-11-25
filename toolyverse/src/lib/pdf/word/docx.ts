/**
 * Writes laid-out pages as a Word document (.docx, Office Open XML). Each PDF page becomes its
 * own section with the same paper size, so pages break where the PDF's did; pictures are placed
 * at their exact spot on the page; tables become real Word tables with merged cells; pages in two
 * columns become two-column sections. Pure: returns the file's bytes.
 */
import { zipStore } from '@editor/engines/PdfTools';
import { isRtl, mainScripts } from '../../lang';
import type { HeadPart, PageOut, Para, Run, RunningHead, TableItem } from './layout';

const tw = (pt: number) => Math.max(0, Math.round(pt * 20));
const emu = (pt: number) => Math.max(0, Math.round(pt * 12700));

// Characters XML 1.0 does not allow (control codes, lone surrogates, U+FFFE/FFFF).
const INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export const xml = (s: string) => s.replace(INVALID, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

/** Indian-script and Arabic-script text needs a font that has those letters when the PDF's font is a Latin one. */
function complexFont(text: string, family: string): string | null {
  const s = mainScripts(text, 0.2);
  if (!s.length || s[0] === 'Latin') return null;
  if (/nirmala|mangal|noto|lohit|kokila|aparajita|shruti|latha|gautami|tunga|kartika|vrinda|raavi|kalinga|urdu|nastaliq|jameel|arial unicode/i.test(family)) return null;
  return s[0] === 'Arabic' ? 'Segoe UI' : s[0] === 'MeeteiMayek' || s[0] === 'OlChiki' ? 'Nirmala UI' : 'Nirmala UI';
}

interface Ctx {
  links: Map<string, string>;
  rels: string[];
}

function linkId(ctx: Ctx, url: string): string {
  let id = ctx.links.get(url);
  if (!id) {
    id = `rIdLink${ctx.links.size + 1}`;
    ctx.links.set(url, id);
    ctx.rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(url)}" TargetMode="External"/>`);
  }
  return id;
}

function runXml(r: Run, rtl = false): string {
  if (r.tab) return '<w:r><w:tab/></w:r>';
  const f = xml(r.font);
  const cs = complexFont(r.text, r.font);
  const sz = Math.max(2, Math.round(r.size * 2));
  const props = `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${cs ? xml(cs) : f}" w:eastAsia="${f}"/>${r.bold ? '<w:b/><w:bCs/>' : ''}${r.italic ? '<w:i/><w:iCs/>' : ''}${r.color && /^[0-9A-F]{6}$/i.test(r.color) ? `<w:color w:val="${r.color}"/>` : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>${r.low ? '<w:highlight w:val="yellow"/>' : ''}${r.underline ? '<w:u w:val="single"/>' : ''}${rtl || isRtl(r.text) ? '<w:rtl/>' : ''}`;
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${xml(r.text)}</w:t></w:r>`;
}

function runsXml(runs: Run[], ctx: Ctx, rtl: boolean): string {
  let out = '';
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (r.link) {
      // Neighbouring runs with the same link go inside one hyperlink.
      let j = i;
      let inner = '';
      while (j < runs.length && runs[j].link === r.link) inner += runXml(runs[j++], rtl);
      out += r.link.startsWith('#') ? `<w:hyperlink w:anchor="${xml(r.link.slice(1))}">${inner}</w:hyperlink>` : `<w:hyperlink r:id="${linkId(ctx, r.link)}">${inner}</w:hyperlink>`;
      i = j - 1;
    } else out += runXml(r, rtl);
  }
  return out;
}

/** Word's single line height of a font, as a multiple of the font size. */
function lineFactor(font = ''): number {
  const f = font.toLowerCase();
  if (/calibri/.test(f)) return 1.22;
  if (/cambria/.test(f)) return 1.172;
  if (/tahoma/.test(f)) return 1.207;
  if (/verdana/.test(f)) return 1.215;
  if (/segoe/.test(f)) return 1.33;
  if (/georgia/.test(f)) return 1.136;
  if (/courier/.test(f)) return 1.133;
  if (/nirmala|mangal|latha|vrinda|shruti|gautami|kartika|tunga|raavi/.test(f)) return 1.6;
  return 1.15;
}

function paraXml(p: Para, ctx: Ctx, exact: boolean, extra = '', sect = ''): string {
  const tabs = p.tabs?.length ? `<w:tabs>${p.tabs.map((t) => `<w:tab w:val="${t.align}" w:pos="${tw(t.pos)}"/>`).join('')}</w:tabs>` : '';
  const ind =
    p.left || p.right || p.first
      ? `<w:ind w:left="${tw(p.left)}" w:right="${tw(p.right)}"${p.first < 0 ? ` w:hanging="${tw(-p.first)}"` : p.first > 0 ? ` w:firstLine="${tw(p.first)}"` : ''}/>`
      : '';
  const style = p.heading ? `<w:pStyle w:val="Heading${p.heading}"/>` : '';
  const num = p.bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : '';
  // Editable text: Word's own spacing, as a multiple of the font's natural line height that
  // gives the PDF's line pitch (single lines keep the natural height).
  const multiple = p.pitch ? Math.max(0.8, Math.min(2.5, p.pitch / (p.size * lineFactor(p.runs[0]?.font)))) : 1;
  // An empty paragraph only holds pictures or the section: it must take no room.
  const blank = !p.runs.length && !p.table && !p.image;
  const spacing = blank
    ? `<w:spacing w:before="${tw(exact ? p.before : Math.min(p.before, 144))}" w:after="0" w:line="20" w:lineRule="exact"/>`
    : exact && p.line ?`<w:spacing w:before="${tw(p.before)}" w:after="0" w:line="${tw(p.line)}" w:lineRule="exact"/>` : `<w:spacing w:before="${tw(Math.min(p.before, 144))}" w:after="0" w:line="${Math.round(240 * multiple)}" w:lineRule="auto"/>`;
  const bidi = p.rtl ? '<w:bidi/>' : '';
  // A boxed or shaded area of the page: Word's paragraph border and shading.
  const side = (n: string, space: number) => `<w:${n} w:val="single" w:sz="6" w:space="${space}" w:color="000000"/>`;
  const bdr = p.border ? `<w:pBdr>${side('top', 2)}${side('left', 2)}${side('bottom', 2)}${side('right', 2)}</w:pBdr>` : '';
  const shd = p.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${p.shade}"/>` : '';
  const ppr = `<w:pPr>${style}${num}${bdr}${shd}${bidi}${tabs}${spacing}${ind}${p.align !== 'left' ? `<w:jc w:val="${p.align}"/>` : ''}${sect}</w:pPr>`;
  const brk = p.colBreak ? '<w:r><w:br w:type="column"/></w:r>' : '';
  return `<w:p>${ppr}${extra}${brk}${runsXml(p.runs, ctx, !!p.rtl)}</w:p>`;
}

/** A real Word table: grid, merged cells, borders when the PDF drew them, heading rows repeated on each page. */
/** A table narrowed, if need be, to fit `width` points (its columns in proportion). */
function fitTo(t: TableItem, width: number): TableItem {
  const total = t.widths.reduce((a, b) => a + b, 0);
  return total > width ? { ...t, widths: t.widths.map((w) => (w * width) / total) } : t;
}

function tableXml(t: TableItem, ctx: Ctx): string {
  if (t.beside?.length) {
    // Tables side by side: a borderless one-row table holds each in a cell of its own.
    const parts = [t, ...t.beside];
    const widths = parts.map((p, i) => tw(i < parts.length - 1 ? parts[i + 1].left - p.left : p.widths.reduce((a, b) => a + b, 0) + 2));
    const cells = parts
      .map((p, i) => `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/></w:tcPr>${tableXml(fitTo({ ...p, beside: undefined, left: 0 }, widths[i] / 20), ctx)}<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p></w:tc>`)
      .join('');
    const none = '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';
    return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblInd w:w="${tw(t.left)}" w:type="dxa"/>${none}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid><w:tr>${cells}</w:tr></w:tbl>`;
  }
  const rows = t.table.rows;
  const nc = rows[0]?.length ?? 0;
  const widths = t.widths.map(tw);
  const border = t.ruled ? '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders>' : '';
  const sz = Math.max(2, Math.round(t.size * 2));
  // Right-to-left tables (Urdu) put their first column on the right, starting at the right margin.
  const rtl = !!t.table.rtl;
  // Text in a ruled PDF table often runs right up to the next line: the right padding stays small.
  const out: string[] = [`<w:tbl><w:tblPr>${rtl ? '<w:bidiVisual/>' : ''}<w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${rtl ? '' : `<w:tblInd w:w="${tw(t.left)}" w:type="dxa"/>`}${border}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="${tw(t.pad ?? 2.85)}" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="${tw(t.ruled ? Math.min(t.pad ?? 2.85, 1.5) : t.pad ?? 2.85)}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`];
  rows.forEach((row, r) => {
    const head = r < t.table.headerRows;
    // The PDF's row height includes its line; Word adds its border (0.5pt) to the row's height.
    const h = t.heights[r] ? `<w:trHeight w:val="${tw(Math.max(1, t.heights[r] - (t.ruled ? 0.6 : 0)))}" w:hRule="atLeast"/>` : '';
    out.push(`<w:tr><w:trPr>${head ? '<w:tblHeader/>' : ''}${h}</w:trPr>`);
    for (let c = 0; c < nc; ) {
      const x = row[c];
      if (x.hidden) {
        // Covered from above by a cell merged downwards: Word writes a continuation cell.
        let up = r - 1;
        while (up >= 0 && rows[up][c].hidden) up--;
        const anchor = up >= 0 ? rows[up][c] : null;
        if (anchor && up + anchor.rowSpan > r) {
          const span = anchor.colSpan;
          out.push(`<w:tc><w:tcPr><w:tcW w:w="${widths.slice(c, c + span).reduce((a, b) => a + b, 0)}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}<w:vMerge/></w:tcPr><w:p/></w:tc>`);
          c += span;
        } else c++;
        continue;
      }
      const span = Math.max(1, x.colSpan);
      const lines = x.text.split('\n');
      const rtl = isRtl(x.text);
      const style = t.cells?.[r]?.[c];
      const jc = style && style.align !== 'left' ? `<w:jc w:val="${style.align}"/>` : '';
      const pad = t.pad ?? 2.85;
      const ind = style && style.indent > pad ? (style.align === 'right' ? `<w:ind w:right="${tw(style.indent - pad)}"/>` : `<w:ind w:left="${tw(style.indent - pad)}"/>`) : '';
      const paras = style
        ? style.lines.map((runs) => `<w:p><w:pPr>${rtl ? '<w:bidi/>' : ''}<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>${ind}${jc}</w:pPr>${runsXml(runs.map((ru) => ({ ...ru, low: ru.low || (x.conf ?? 100) < 60 })), ctx, rtl)}</w:p>`).join('')
        : lines
        .map((l) => `<w:p><w:pPr>${rtl ? '<w:bidi/>' : ''}<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${l ? runsXml([{ text: l, size: t.size, font: t.font, bold: head || !!x.bold, italic: false, low: (x.conf ?? 100) < 60, link: x.link }], ctx, rtl) : ''}</w:p>`)
        .join('');
      out.push(`<w:tc><w:tcPr><w:tcW w:w="${widths.slice(c, c + span).reduce((a, b) => a + b, 0)}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${x.rowSpan > 1 ? '<w:vMerge w:val="restart"/>' : ''}${t.shades?.[r]?.[c] ? `<w:shd w:val="clear" w:color="auto" w:fill="${t.shades[r][c]}"/>` : ''}${style && style.vAlign !== 'top' ? `<w:vAlign w:val="${style.vAlign}"/>` : ''}</w:tcPr>${paras || `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="${sz}"/></w:rPr></w:r></w:p>`}</w:tc>`);
      c += span;
    }
    out.push('</w:tr>');
  });
  out.push('</w:tbl>');
  return out.join('');
}

function sectXml(page: PageOut, opts: { cols?: PageOut['columns']; continuous?: boolean; heads?: string; start?: number }): string {
  const { width, height, margin: m } = page;
  const orient = width > height ? ' w:orient="landscape"' : '';
  const cols = opts.cols ? `<w:cols w:num="2" w:space="${tw(opts.cols.space)}" w:equalWidth="0"><w:col w:w="${tw(opts.cols.widths[0])}" w:space="${tw(opts.cols.space)}"/><w:col w:w="${tw(opts.cols.widths[1])}"/></w:cols>` : '';
  // A frame round the page becomes Word's page border, the same distance from the page edges.
  let border = '';
  if (page.border) {
    const b = page.border;
    const side = (name: string, d: number) => `<w:${name} w:val="single" w:sz="${Math.min(48, Math.max(2, Math.round(b.width * 8)))}" w:space="${Math.max(0, Math.min(31, Math.round(d)))}" w:color="${b.color}"/>`;
    border = `<w:pgBorders w:offsetFrom="page">${side('top', b.top)}${side('left', b.left)}${side('bottom', b.bottom)}${side('right', b.right)}</w:pgBorders>`;
  }
  const num = opts.start !== undefined ? `<w:pgNumType w:start="${opts.start}"/>` : '';
  return `<w:sectPr>${opts.heads ?? ''}${opts.continuous ? '<w:type w:val="continuous"/>' : ''}<w:pgSz w:w="${tw(width)}" w:h="${tw(height)}"${orient}/><w:pgMar w:top="${tw(m.top)}" w:right="${tw(m.right)}" w:bottom="${tw(m.bottom)}" w:left="${tw(m.left)}" w:header="${tw(page.headerAt ?? Math.min(28, m.top / 2))}" w:footer="${tw(page.footerAt ?? 14)}" w:gutter="0"/>${border}${num}${cols}</w:sectPr>`;
}

export interface DocxInfo {
  title?: string;
  headers?: RunningHead[];
  footers?: RunningHead[];
}

/**
 * Header or footer part: its lines, each with pieces at the left, centre and right (tab stops
 * across `width` twips), `{PAGE}` as Word's page number field. Without `h`, an empty part
 * (for pages without header or footer after pages with one).
 */
function headPart(kind: 'hdr' | 'ftr', h: RunningHead | null, width: number): string {
  const open = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:${kind} ${NS}>`;
  if (!h) return `${open}<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p></w:${kind}>`;
  const sz = Math.max(10, Math.round(h.size * 2));
  const rpr = (bold: boolean) => `<w:rPr>${bold ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
  const run = (t: string, bold: boolean) => (t ? `<w:r>${rpr(bold)}<w:t xml:space="preserve">${xml(t)}</w:t></w:r>` : '');
  const field = (bold: boolean) =>
    `<w:r>${rpr(bold)}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rpr(bold)}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r>${rpr(bold)}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${rpr(bold)}<w:t>${h.start ?? 1}</w:t></w:r><w:r>${rpr(bold)}<w:fldChar w:fldCharType="end"/></w:r>`;
  const text = (p: HeadPart) =>
    p.text
      .split('{PAGE}')
      .map((x, i, all) => run(x, p.bold) + (i < all.length - 1 ? field(p.bold) : ''))
      .join('');
  const spacing = '<w:spacing w:before="0" w:after="0"/>';
  const paras = h.lines.map((parts) => {
    if (parts.length === 1) {
      const p = parts[0];
      return `<w:p><w:pPr>${spacing}${p.align === 'left' ? '' : `<w:jc w:val="${p.align}"/>`}</w:pPr>${text(p)}</w:p>`;
    }
    const center = parts.some((p) => p.align === 'center');
    const tabs = `<w:tabs>${center ? `<w:tab w:val="center" w:pos="${Math.round(width / 2)}"/>` : ''}<w:tab w:val="right" w:pos="${width}"/></w:tabs>`;
    let at: HeadPart['align'] = 'left';
    const body = parts
      .map((p, i) => {
        let gap = '';
        if (p.align === 'center' && at === 'left') gap = '<w:r><w:tab/></w:r>';
        else if (p.align === 'right' && at !== 'right') gap = '<w:r><w:tab/></w:r>'.repeat(center && at === 'left' ? 2 : 1);
        else if (i > 0) gap = run('    ', false);
        at = p.align;
        return gap + text(p);
      })
      .join('');
    return `<w:p><w:pPr>${tabs}${spacing}</w:pPr>${body}</w:p>`;
  });
  return `${open}${paras.join('')}</w:${kind}>`;
}

export function buildDocx(pages: PageOut[], info: DocxInfo = {}): Uint8Array {
  const media: { name: string; bytes: Uint8Array }[] = [];
  const ctx: Ctx = {
    links: new Map(),
    rels: [
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
      '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
      '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
    ],
  };
  // Header and footer parts: one per run of pages, and an empty one for pages without.
  const headers = info.headers ?? [];
  const footers = info.footers ?? [];
  const partFiles: { name: string; xml: string }[] = [];
  const contentWidth = (i: number) => {
    const p = pages[Math.min(i, pages.length - 1)];
    return p ? Math.max(1, tw(p.width - p.margin.left - p.margin.right)) : 9000;
  };
  for (const [kind, list, word] of [['hdr', headers, 'header'], ['ftr', footers, 'footer']] as const) {
    if (!list.length) continue;
    list.forEach((h, k) => partFiles.push({ name: `${word}${k + 1}.xml`, xml: headPart(kind, h, contentWidth(h.from)) }));
    partFiles.push({ name: `${word}0.xml`, xml: headPart(kind, null, 0) });
    list.forEach((_, k) => ctx.rels.push(`<Relationship Id="rId${word}${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${word}" Target="${word}${k + 1}.xml"/>`));
    ctx.rels.push(`<Relationship Id="rId${word}0" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${word}" Target="${word}0.xml"/>`);
  }
  const groupOf = (list: RunningHead[], i: number) => list.findIndex((g) => i >= g.from && i <= g.to);
  // A section without its own header keeps the one before: references go where they change.
  const headsFor = (i: number) => {
    let x = '';
    for (const [list, word] of [[headers, 'header'], [footers, 'footer']] as const) {
      if (!list.length) continue;
      const g = groupOf(list, i);
      if (i === 0 || g !== groupOf(list, i - 1)) x += `<w:${word}Reference w:type="default" r:id="rId${word}${g + 1}"/>`;
    }
    return x;
  };
  // Headers and footers sit where they were on the PDF page.
  pages.forEach((p, i) => {
    const h = headers[groupOf(headers, i)];
    const fo = footers[groupOf(footers, i)];
    if (h) p.headerAt = h.edge;
    if (fo) {
      p.footerAt = fo.edge;
      // Text that runs into the footer's place in the PDF would be pushed onto a new page in Word
      // (its body ends where the footer starts): that page's footer goes just below the text.
      const footerH = fo.lines.length * fo.size * 1.2;
      if (p.contentBottom && p.contentBottom > p.height - fo.edge - footerH - 2) p.footerAt = Math.max(2, Math.min(fo.edge, p.height - p.contentBottom - footerH - 3));
    }
  });
  const startFor = (i: number) => (footers.find((g) => g.from === i && g.start !== undefined) ?? headers.find((g) => g.from === i && g.start !== undefined))?.start;
  let pic = 0;
  const body: string[] = [];

  pages.forEach((page, pi) => {
    // Pictures float at their place on the page, attached to the page's first paragraph.
    const textBoxes = page.paras.length > 0;
    const drawings = page.images
      .map((img) => {
        pic++;
        const name = `image${pic}.${img.type === 'jpeg' ? 'jpg' : 'png'}`;
        const rid = `rIdImg${pic}`;
        media.push({ name: `word/media/${name}`, bytes: img.bytes });
        ctx.rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
        // Editable text goes below a wide picture (a small one, such as a logo, stays where it is: Word
        // would push nearby tables down to wrap round it). Drawings of the
        // page (layout mode) and exact layouts keep them in place behind the text.
        const bodyW = page.width - page.margin.left - page.margin.right;
        const wrap = page.exact || img.graphics ? '' : img.w > bodyW * 0.5 ? '<wp:wrapTopAndBottom/>' : '';
        const cx = emu(img.w);
        const cy = emu(img.h);
        return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${pic}" behindDoc="${wrap ? 0 : textBoxes ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${emu(img.x)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${emu(img.y)}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>${wrap || '<wp:wrapNone/>'}<wp:docPr id="${pic}" name="Picture ${pic}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${pic}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
      })
      .join('');

    // Pictures set in the text: each in its own paragraph, at its size.
    const inline = (img: NonNullable<Para['image']>) => {
      pic++;
      const name = `image${pic}.${img.type === 'jpeg' ? 'jpg' : 'png'}`;
      const rid = `rIdImg${pic}`;
      media.push({ name: `word/media/${name}`, bytes: img.bytes });
      ctx.rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
      const cx = emu(img.w);
      const cy = emu(img.h);
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${pic}" name="Picture ${pic}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${pic}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    };
    const empty: Para = { runs: [], align: 'left', left: 0, right: 0, first: 0, before: 0, line: 12, size: 11 };
    // A page must end in a paragraph (it carries the section); a table cannot carry it.
    const paras: Para[] = page.paras.length ? [...page.paras] : [empty];
    if (paras[paras.length - 1].table) paras.push({ ...empty, line: 1 });
    if (paras[0].table) paras.unshift({ ...empty, line: 1, before: 0 });
    const lastPage = pi === pages.length - 1;
    const sectHeads = headsFor(pi);
    const start = startFor(pi);
    const cols = page.columns;
    paras.forEach((p, i) => {
      if (p.table) {
        // Space above a table: Word tables have none of their own, so an empty line of that height goes first.
        if (p.before > 1) body.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${tw(Math.max(1, p.before))}" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>`);
        body.push(tableXml(p.table, ctx));
        return;
      }
      let sect = '';
      const isLast = i === paras.length - 1;
      // Two-column pages: the part above the columns ends a one-column section, the columns their own.
      if (cols && i === cols.start - 1) sect = sectXml(page, { heads: sectHeads, start });
      else if (isLast && !lastPage) sect = sectXml(page, cols ? { cols, continuous: cols.start > 0, heads: cols.start > 0 ? '' : sectHeads, start: cols.start > 0 ? undefined : start } : { heads: sectHeads, start });
      body.push(paraXml(p, ctx, page.exact, (i === 0 ? drawings : '') + (p.image ? inline(p.image) : ''), sect));
    });
  });

  const last = pages[pages.length - 1];
  const L = pages.length - 1;
  const finalSect = last ? sectXml(last, last.columns ? { cols: last.columns, continuous: last.columns.start > 0, heads: !last.columns.start ? headsFor(L) : '', start: !last.columns.start ? startFor(L) : undefined } : { heads: headsFor(L), start: startFor(L) }) : '';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body.join('')}${finalSect}</w:body></w:document>`;

  const headings = [1, 2, 3]
    .map(
      (n) =>
        `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="${n - 1}"/></w:pPr></w:style>`,
    )
    .join('');
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Nirmala UI" w:eastAsia="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-IN" w:bidi="hi-IN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:widowControl w:val="0"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${headings}<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;

  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(info.title ?? '')}</dc:title><dc:creator>Toolyverse PDF to Word</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;

  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>${partFiles.map((p) => `<Override PartName="/word/${p.name}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${p.name.startsWith('header') ? 'header' : 'footer'}+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${ctx.rels.join('')}</Relationships>`;

  const enc = new TextEncoder();
  return zipStore([
    { name: '[Content_Types].xml', bytes: enc.encode(types) },
    { name: '_rels/.rels', bytes: enc.encode(rootRels) },
    { name: 'docProps/core.xml', bytes: enc.encode(core) },
    { name: 'word/document.xml', bytes: enc.encode(document) },
    { name: 'word/_rels/document.xml.rels', bytes: enc.encode(docRels) },
    { name: 'word/styles.xml', bytes: enc.encode(styles) },
    { name: 'word/settings.xml', bytes: enc.encode(settings) },
    { name: 'word/numbering.xml', bytes: enc.encode(numbering) },
    ...partFiles.map((p) => ({ name: `word/${p.name}`, bytes: enc.encode(p.xml) })),
    ...media,
  ]);
}
