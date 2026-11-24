/**
 * Writes laid-out pages as a Word document (.docx, Office Open XML). Each PDF page becomes its
 * own section with the same paper size, so pages break where the PDF's did; pictures are placed
 * at their exact spot on the page; tables become real Word tables with merged cells; pages in two
 * columns become two-column sections. Pure: returns the file's bytes.
 */
import { zipStore } from '@editor/engines/PdfTools';
import { isRtl, mainScripts } from '../../lang';
import type { PageOut, Para, Run, TableItem } from './layout';

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

function paraXml(p: Para, ctx: Ctx, exact: boolean, extra = '', sect = ''): string {
  const tabs = p.tabs?.length ? `<w:tabs>${p.tabs.map((t) => `<w:tab w:val="${t.align}" w:pos="${tw(t.pos)}"/>`).join('')}</w:tabs>` : '';
  const ind =
    p.left || p.right || p.first
      ? `<w:ind w:left="${tw(p.left)}" w:right="${tw(p.right)}"${p.first < 0 ? ` w:hanging="${tw(-p.first)}"` : p.first > 0 ? ` w:firstLine="${tw(p.first)}"` : ''}/>`
      : '';
  const style = p.heading ? `<w:pStyle w:val="Heading${p.heading}"/>` : '';
  const num = p.bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : '';
  const spacing = exact && p.line ? `<w:spacing w:before="${tw(p.before)}" w:after="0" w:line="${tw(p.line)}" w:lineRule="exact"/>` : `<w:spacing w:before="${tw(Math.min(p.before, 36))}" w:after="0" w:line="${Math.round(240 * 1.08)}" w:lineRule="auto"/>`;
  const bidi = p.rtl ? '<w:bidi/>' : '';
  const ppr = `<w:pPr>${style}${num}${bidi}${tabs}${spacing}${ind}${p.align !== 'left' ? `<w:jc w:val="${p.align}"/>` : ''}${sect}</w:pPr>`;
  const brk = p.colBreak ? '<w:r><w:br w:type="column"/></w:r>' : '';
  return `<w:p>${ppr}${extra}${brk}${runsXml(p.runs, ctx, !!p.rtl)}</w:p>`;
}

/** A real Word table: grid, merged cells, borders when the PDF drew them, heading rows repeated on each page. */
function tableXml(t: TableItem, ctx: Ctx): string {
  const rows = t.table.rows;
  const nc = rows[0]?.length ?? 0;
  const widths = t.widths.map(tw);
  const border = t.ruled ? '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="808080"/><w:left w:val="single" w:sz="4" w:color="808080"/><w:bottom w:val="single" w:sz="4" w:color="808080"/><w:right w:val="single" w:sz="4" w:color="808080"/><w:insideH w:val="single" w:sz="4" w:color="808080"/><w:insideV w:val="single" w:sz="4" w:color="808080"/></w:tblBorders>' : '';
  const sz = Math.max(2, Math.round(t.size * 2));
  // Right-to-left tables (Urdu) put their first column on the right, starting at the right margin.
  const rtl = !!t.table.rtl;
  const out: string[] = [`<w:tbl><w:tblPr>${rtl ? '<w:bidiVisual/>' : ''}<w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${rtl ? '' : `<w:tblInd w:w="${tw(t.left)}" w:type="dxa"/>`}${border}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`];
  rows.forEach((row, r) => {
    const head = r < t.table.headerRows;
    const h = t.heights[r] ? `<w:trHeight w:val="${tw(t.heights[r])}" w:hRule="atLeast"/>` : '';
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
      const paras = lines
        .map((l) => `<w:p><w:pPr>${rtl ? '<w:bidi/>' : ''}<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${l ? runsXml([{ text: l, size: t.size, font: t.font, bold: head || !!x.bold, italic: false, low: (x.conf ?? 100) < 60, link: x.link }], ctx, rtl) : ''}</w:p>`)
        .join('');
      out.push(`<w:tc><w:tcPr><w:tcW w:w="${widths.slice(c, c + span).reduce((a, b) => a + b, 0)}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${x.rowSpan > 1 ? '<w:vMerge w:val="restart"/>' : ''}</w:tcPr>${paras || `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="${sz}"/></w:rPr></w:r></w:p>`}</w:tc>`);
      c += span;
    }
    out.push('</w:tr>');
  });
  out.push('</w:tbl>');
  return out.join('');
}

function sectXml(page: PageOut, opts: { cols?: PageOut['columns']; continuous?: boolean; heads?: string }): string {
  const { width, height, margin: m } = page;
  const orient = width > height ? ' w:orient="landscape"' : '';
  const cols = opts.cols ? `<w:cols w:num="2" w:space="${tw(opts.cols.space)}" w:equalWidth="0"><w:col w:w="${tw(opts.cols.widths[0])}" w:space="${tw(opts.cols.space)}"/><w:col w:w="${tw(opts.cols.widths[1])}"/></w:cols>` : '';
  return `<w:sectPr>${opts.heads ?? ''}${opts.continuous ? '<w:type w:val="continuous"/>' : ''}<w:pgSz w:w="${tw(width)}" w:h="${tw(height)}"${orient}/><w:pgMar w:top="${tw(m.top)}" w:right="${tw(m.right)}" w:bottom="${tw(m.bottom)}" w:left="${tw(m.left)}" w:header="${tw(Math.min(28, m.top / 2))}" w:footer="${tw(14)}" w:gutter="0"/>${cols}</w:sectPr>`;
}

export interface DocxInfo {
  title?: string;
  header?: { text: string; align: Para['align'] };
  footer?: { text: string; align: Para['align'] };
}

/** Header or footer part: the text, with {PAGE} as Word's page number field. */
function headPart(kind: 'hdr' | 'ftr', h: { text: string; align: Para['align'] }): string {
  const parts = h.text.split('{PAGE}');
  const run = (t: string) => (t ? `<w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${xml(t)}</w:t></w:r>` : '');
  const field = '<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>';
  const body = parts.map((p, i) => run(p) + (i < parts.length - 1 ? field : '')).join('');
  const tag = kind === 'hdr' ? 'hdr' : 'ftr';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:${tag} ${NS}><w:p><w:pPr>${h.align !== 'left' ? `<w:jc w:val="${h.align === 'both' ? 'left' : h.align}"/>` : ''}</w:pPr>${body}</w:p></w:${tag}>`;
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
  if (info.header) ctx.rels.push('<Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>');
  if (info.footer) ctx.rels.push('<Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>');
  const heads = `${info.header ? '<w:headerReference w:type="default" r:id="rIdHeader1"/>' : ''}${info.footer ? '<w:footerReference w:type="default" r:id="rIdFooter1"/>' : ''}`;
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
        const cx = emu(img.w);
        const cy = emu(img.h);
        return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${pic}" behindDoc="${textBoxes ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${emu(img.x)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${emu(img.y)}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${pic}" name="Picture ${pic}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${pic}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
      })
      .join('');

    const empty: Para = { runs: [], align: 'left', left: 0, right: 0, first: 0, before: 0, line: 12, size: 11 };
    // A page must end in a paragraph (it carries the section); a table cannot carry it.
    const paras: Para[] = page.paras.length ? [...page.paras] : [empty];
    if (paras[paras.length - 1].table) paras.push({ ...empty, line: 1 });
    if (paras[0].table) paras.unshift({ ...empty, line: 1, before: 0 });
    const lastPage = pi === pages.length - 1;
    const sectHeads = pi === 0 ? heads : '';
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
      if (cols && i === cols.start - 1) sect = sectXml(page, { heads: sectHeads });
      else if (isLast && !lastPage) sect = sectXml(page, cols ? { cols, continuous: cols.start > 0, heads: cols.start > 0 ? '' : sectHeads } : { heads: sectHeads });
      body.push(paraXml(p, ctx, page.exact, i === 0 ? drawings : '', sect));
    });
  });

  const last = pages[pages.length - 1];
  const finalSect = last ? sectXml(last, last.columns ? { cols: last.columns, continuous: last.columns.start > 0, heads: pages.length === 1 && !last.columns.start ? heads : '' } : { heads: pages.length === 1 ? heads : '' }) : '';
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

  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>${info.header ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}${info.footer ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

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
    ...(info.header ? [{ name: 'word/header1.xml', bytes: enc.encode(headPart('hdr', info.header)) }] : []),
    ...(info.footer ? [{ name: 'word/footer1.xml', bytes: enc.encode(headPart('ftr', info.footer)) }] : []),
    ...media,
  ]);
}
