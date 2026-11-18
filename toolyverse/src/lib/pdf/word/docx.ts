/**
 * Writes laid-out pages as a Word document (.docx, Office Open XML). Each PDF page becomes its
 * own section with the same paper size, so pages break where the PDF's did; pictures are placed
 * at their exact spot on the page. Pure: returns the file's bytes.
 */
import { zipStore } from '@editor/engines/PdfTools';
import type { PageOut, Para, Run } from './layout';

const tw = (pt: number) => Math.max(0, Math.round(pt * 20));
const emu = (pt: number) => Math.max(0, Math.round(pt * 12700));

// Characters XML 1.0 does not allow (control codes, lone surrogates, U+FFFE/FFFF).
const INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export const xml = (s: string) => s.replace(INVALID, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

function runXml(r: Run): string {
  if (r.tab) return '<w:r><w:tab/></w:r>';
  const f = xml(r.font);
  const sz = Math.max(2, Math.round(r.size * 2));
  const props = `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}" w:eastAsia="${f}"/>${r.bold ? '<w:b/><w:bCs/>' : ''}${r.italic ? '<w:i/><w:iCs/>' : ''}${r.color && /^[0-9A-F]{6}$/i.test(r.color) ? `<w:color w:val="${r.color}"/>` : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`;
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${xml(r.text)}</w:t></w:r>`;
}

function paraXml(p: Para, extra = '', sect = ''): string {
  const tabs = p.tabs?.length ? `<w:tabs>${p.tabs.map((t) => `<w:tab w:val="${t.align}" w:pos="${tw(t.pos)}"/>`).join('')}</w:tabs>` : '';
  const ind =
    p.left || p.right || p.first
      ? `<w:ind w:left="${tw(p.left)}" w:right="${tw(p.right)}"${p.first < 0 ? ` w:hanging="${tw(-p.first)}"` : p.first > 0 ? ` w:firstLine="${tw(p.first)}"` : ''}/>`
      : '';
  const style = p.heading ? `<w:pStyle w:val="Heading${p.heading}"/>` : '';
  const ppr = `<w:pPr>${style}${tabs}<w:spacing w:before="${tw(p.before)}" w:after="0" w:line="${tw(p.line)}" w:lineRule="exact"/>${ind}${p.align !== 'left' ? `<w:jc w:val="${p.align}"/>` : ''}${sect}</w:pPr>`;
  return `<w:p>${ppr}${extra}${p.runs.map(runXml).join('')}</w:p>`;
}

function sectXml(page: PageOut): string {
  const { width, height, margin: m } = page;
  const orient = width > height ? ' w:orient="landscape"' : '';
  return `<w:sectPr><w:pgSz w:w="${tw(width)}" w:h="${tw(height)}"${orient}/><w:pgMar w:top="${tw(m.top)}" w:right="${tw(m.right)}" w:bottom="${tw(m.bottom)}" w:left="${tw(m.left)}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
}

export interface DocxInfo {
  title?: string;
}

export function buildDocx(pages: PageOut[], info: DocxInfo = {}): Uint8Array {
  const media: { name: string; bytes: Uint8Array }[] = [];
  const rels: string[] = [
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
  ];
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
        rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
        const cx = emu(img.w);
        const cy = emu(img.h);
        return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${pic}" behindDoc="${textBoxes ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${emu(img.x)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${emu(img.y)}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${pic}" name="Picture ${pic}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${pic}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
      })
      .join('');

    const paras: Para[] = page.paras.length ? page.paras : [{ runs: [], align: 'left', left: 0, right: 0, first: 0, before: 0, line: 12, size: 11 }];
    const lastPage = pi === pages.length - 1;
    paras.forEach((p, i) => {
      // A section ends with the last paragraph of its page; the final page's section closes the body.
      const sect = !lastPage && i === paras.length - 1 ? sectXml(page) : '';
      body.push(paraXml(p, i === 0 ? drawings : '', sect));
    });
  });

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body.join('')}${pages.length ? sectXml(pages[pages.length - 1]) : ''}</w:body></w:document>`;

  const headings = [1, 2, 3]
    .map(
      (n) =>
        `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="${n - 1}"/></w:pPr></w:style>`,
    )
    .join('');
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-IN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:widowControl w:val="0"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${headings}</w:styles>`;

  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(info.title ?? '')}</dc:title><dc:creator>Toolyverse PDF to Word</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;

  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`;

  const enc = new TextEncoder();
  return zipStore([
    { name: '[Content_Types].xml', bytes: enc.encode(types) },
    { name: '_rels/.rels', bytes: enc.encode(rootRels) },
    { name: 'docProps/core.xml', bytes: enc.encode(core) },
    { name: 'word/document.xml', bytes: enc.encode(document) },
    { name: 'word/_rels/document.xml.rels', bytes: enc.encode(docRels) },
    { name: 'word/styles.xml', bytes: enc.encode(styles) },
    { name: 'word/settings.xml', bytes: enc.encode(settings) },
    ...media,
  ]);
}
