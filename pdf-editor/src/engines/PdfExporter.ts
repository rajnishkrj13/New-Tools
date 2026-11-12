// fontkit (used for embedded font files) expects this runtime to exist.
import 'regenerator-runtime/runtime';
import {
  BlendMode,
  PDFArray,
  PDFDocument,
  PDFFont,
  PDFHexString,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  beginText,
  endMarkedContent,
  endText,
  setFillingColor,
  setFontAndSize,
  setGraphicsState,
  setTextMatrix,
  showText,
  PDFRawStream,
  PDFRef,
  degrees,
  decodePDFRawStream,
  PDFImage,
  PDFPage,
  StandardFonts,
  LineCapStyle,
  LineJoinStyle,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSqueeze,
  setLineJoin,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { EditorObject, ImageAsset, TextEditObject, TextStyle } from '../types/objects';
import { markShapes } from './TextHighlighter';
import type { Matrix, PageInfo, Rect } from '../types/pdf';
import { FLIP_Y, computeViewTransform, invert, makePageInfo, mul, rotateDeg, translate } from './CoordinateMapper';
import { FALLBACK_FONT_ID, getFont, hasBundledFont, loadBundledFont } from './FontManager';
import { layoutTextEdit, layoutTextObject, type TextRun } from './TextEditLayout';
import { removeGlyphsFromContent, type TextOpInfo } from './TextRemover';
import { getShaper, isRightToLeft, needsShaping, type Shaper } from './TextShaper';
import { measureText } from '../utils/fontUtils';
import { validateObjects } from '../utils/validationUtils';

/**
 * Applies every edit to the original PDF with pdf-lib. The original content streams are
 * kept as they are; edits are appended as real vector text, images and shapes.
 *
 * All drawing happens through `inView`, which installs a matrix that maps view space
 * (what the user saw: rotated, cropped, y down) back to PDF user space, so one code path
 * is correct for portrait, landscape, rotated and cropped pages.
 */

export class ExportError extends Error {
  constructor(message: string, public details: string[] = []) {
    super(message);
  }
}

export interface ExportInput {
  bytes: Uint8Array;
  pages: PageInfo[];
  objects: EditorObject[];
  assets: Record<string, ImageAsset>;
  /** Bytes of the other PDFs that pages were added from, by source id. */
  sources?: Record<string, Uint8Array>;
  /**
   * Glyph positions of a page's own text operators (from PDF.js). When given, edited
   * original text is deleted from the file; without it the text is only covered.
   */
  analyzeText?: (pageIndex: number) => Promise<TextOpInfo[] | null>;
  /** Needed only when the document contains secure redactions. */
  rasterizePage?: (pageIndex: number, redactions: Rect[]) => Promise<Uint8Array>;
  onProgress?: (done: number, total: number, label: string) => void;
}

export interface ExportResult {
  bytes: Uint8Array;
  pagesModified: number;
  objectsWritten: number;
  flattenedPages: number[];
  /** Original glyphs deleted from the content streams because their text was edited. */
  removedGlyphs: number;
  /** Pieces of text drawn through the complex-script shaper. */
  shapedRuns: number;
  /** True when pages were moved, rotated, added or deleted. */
  structureChanged: boolean;
  warnings: string[];
}

const STANDARD: Record<string, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  Times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  Courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

export function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  const n = parseInt(full.slice(0, 6), 16) || 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export async function exportPdf(input: ExportInput): Promise<ExportResult> {
  const { objects, assets, onProgress } = input;
  const warnings: string[] = [];

  const problems = validateObjects(objects, input.pages, assets);
  if (problems.length) throw new ExportError('Some edits cannot be exported.', problems);

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input.bytes, { updateMetadata: false });
  } catch (e: any) {
    if (/encrypt/i.test(e?.message ?? '')) {
      throw new ExportError('This PDF is encrypted, so its content cannot be rewritten. Save an unprotected copy first.');
    }
    throw new ExportError(`The original PDF could not be parsed for writing: ${e?.message ?? e}`);
  }
  doc.registerFontkit(fontkit);
  const structureChanged = await applyPageStructure(doc, input);

  // ---- fonts ---------------------------------------------------------------------------
  type FontStyle = Pick<TextStyle, 'fontFamily' | 'bold' | 'italic'>;
  const fontCache = new Map<string, PDFFont>();
  /** Bytes of fonts embedded from a file; only these can be shaped by HarfBuzz. */
  const fontFiles = new Map<PDFFont, Uint8Array>();
  let shaper: Shaper | null = null;
  let unshaped = false;
  let rightToLeft = false;
  const fontKeys = new Map<PDFPage, Map<PDFFont, PDFName>>();
  const fontKeyOn = (pg: PDFPage, font: PDFFont): PDFName => {
    if (!fontKeys.has(pg)) fontKeys.set(pg, new Map());
    const keys = fontKeys.get(pg)!;
    if (!keys.has(font)) keys.set(font, pg.node.newFontDictionary(font.name, font.ref));
    return keys.get(font)!;
  };
  /** Which characters each embedded font can draw (code points for font files, probing for standard fonts). */
  const coverage = new Map<PDFFont, { set: Set<number> | null; probed: Map<string, boolean> }>();
  const fontFor = async (s: FontStyle): Promise<PDFFont> => {
    const def = getFont(s.fontFamily);
    const key = def.custom ? def.id : `${def.id}|${s.bold}|${s.italic}`;
    let font = fontCache.get(key);
    if (!font) {
      try {
        // Font files are embedded whole: pdf-lib's subsetter drops glyphs of some fonts
        // (they then show as blanks), and a correct file matters more than a small one.
        const file = def.custom ? def.custom.bytes : def.bundled ? await loadBundledFont(s.bold, s.italic) : null;
        if (file) {
          font = await doc.embedFont(file, { subset: false });
          fontFiles.set(font, file);
        } else font = await doc.embedFont((STANDARD[def.id] ?? STANDARD.Helvetica)[(s.bold ? 1 : 0) + (s.italic ? 2 : 0)]);
      } catch (e: any) {
        throw new ExportError(`The font "${def.label}" could not be embedded: ${e?.message ?? e}`);
      }
      fontCache.set(key, font);
      coverage.set(font, { set: def.custom || def.bundled ? new Set(font.getCharacterSet()) : null, probed: new Map() });
      if (def.custom && (s.bold || s.italic)) {
        warnings.push(`"${def.label}" was embedded as uploaded; bold/italic need their own font file.`);
      }
    }
    return font;
  };
  const canDraw = (font: PDFFont, ch: string): boolean => {
    if (!ch.trim()) return true;
    const cov = coverage.get(font)!;
    if (cov.set) return cov.set.has(ch.codePointAt(0)!);
    let ok = cov.probed.get(ch);
    if (ok === undefined) {
      try {
        font.encodeText(ch);
        ok = true;
      } catch {
        ok = false;
      }
      cov.probed.set(ch, ok);
    }
    return ok;
  };

  /**
   * Splits text into pieces that one font can draw. Characters the chosen font lacks go to
   * the bundled Unicode font. A character no available font can draw stops the export -
   * text is never dropped silently.
   */
  interface Piece {
    text: string;
    start: number;
    font: PDFFont;
  }
  const unsupported: string[] = [];
  let usedFallback = false;
  const piecesFor = async (text: string, s: FontStyle, pageIndex: number): Promise<Piece[] | null> => {
    const font = await fontFor(s);
    const chars = [...text];
    // Indic, Thai, Arabic, Hebrew ... need real shaping; load HarfBuzz the first time one appears.
    if (needsShaping(text)) {
      shaper ??= await getShaper();
      if (!shaper) unshaped = true;
      if (isRightToLeft(text)) rightToLeft = true;
    }
    if (chars.every((ch) => canDraw(font, ch))) return [{ text, start: 0, font }];
    const def = getFont(s.fontFamily);
    const fallback = hasBundledFont() && s.fontFamily !== FALLBACK_FONT_ID ? await fontFor({ ...s, fontFamily: FALLBACK_FONT_ID }) : null;
    const bad = new Set(chars.filter((ch) => !canDraw(font, ch) && !(fallback && canDraw(fallback, ch))));
    if (bad.size) {
      unsupported.push(
        `Page ${pageIndex + 1}: no available font has a glyph for ${[...bad].map((c) => `"${c}"`).join(', ')}` +
          ` (tried "${def.label}"${fallback ? ' and Noto Sans' : ''}). Upload a TTF/OTF font that contains these characters and apply it to this text.`,
      );
      return null;
    }
    usedFallback = true;
    const pieces: Piece[] = [];
    let pos = 0;
    for (const ch of chars) {
      // Spaces stay with the piece they follow.
      const last = pieces[pieces.length - 1];
      const f = !ch.trim() && last ? last.font : canDraw(font, ch) ? font : fallback!;
      if (last && last.font === f) last.text += ch;
      else pieces.push({ text: ch, start: pos, font: f });
      pos += ch.length;
    }
    return pieces;
  };

  // ---- images --------------------------------------------------------------------------
  const imageCache = new Map<string, PDFImage>();
  const imageFor = async (assetId: string): Promise<PDFImage> => {
    let img = imageCache.get(assetId);
    if (!img) {
      const asset = assets[assetId];
      try {
        img = asset.mime === 'image/png' ? await doc.embedPng(asset.bytes) : await doc.embedJpg(asset.bytes);
      } catch (e: any) {
        throw new ExportError(`The image "${asset.name}" could not be embedded: ${e?.message ?? e}`);
      }
      imageCache.set(assetId, img);
    }
    return img;
  };

  // ---- per page ------------------------------------------------------------------------
  const byPage = new Map<number, EditorObject[]>();
  for (const o of objects) {
    if (!byPage.has(o.pageIndex)) byPage.set(o.pageIndex, []);
    byPage.get(o.pageIndex)!.push(o);
  }
  const pageIndexes = [...byPage.keys()].sort((a, b) => a - b);
  const flattenedPages: number[] = [];
  const coveredPages = new Set<number>();
  let removedGlyphs = 0;
  let shapedRuns = 0;
  let written = 0;

  for (let n = 0; n < pageIndexes.length; n++) {
    const pageIndex = pageIndexes[n];
    onProgress?.(n, pageIndexes.length, `Writing page ${pageIndex + 1}`);
    const info = input.pages[pageIndex];
    const list = byPage.get(pageIndex)!;
    let page = doc.getPage(pageIndex);
    let toPdf: Matrix = invert(info.viewTransform);

    // Secure redaction: replace the page by an image of itself with the boxes burned in.
    const redactions = list.filter((o) => o.type === 'redact') as Extract<EditorObject, { type: 'redact' }>[];
    if (redactions.length) {
      if (!input.rasterizePage) throw new ExportError('Secure redaction needs the page renderer, which is not available.');
      const png = await input.rasterizePage(pageIndex, redactions);
      const image = await doc.embedPng(png);
      doc.removePage(pageIndex);
      page = doc.insertPage(pageIndex, [info.width, info.height]);
      page.drawImage(image, { x: 0, y: 0, width: info.width, height: info.height });
      toPdf = invert(computeViewTransform([0, 0, info.width, info.height], 0).transform);
      flattenedPages.push(pageIndex);
      written += redactions.length;
    }

    // Take the original glyphs of edited text out of the page content, so the old text is
    // gone from the file (not just hidden). Must happen before anything is drawn on the page.
    const removedMasks = new Set<Rect>();
    const edits = list.filter((o): o is TextEditObject => o.type === 'textedit');
    if (edits.length && input.analyzeText && !redactions.length) {
      try {
        const masks = edits.flatMap((e) => layoutTextEdit(e).masks);
        const info = masks.length ? await input.analyzeText(pageIndex) : null;
        const content = info ? readPageContent(doc, page) : null;
        if (info && content) {
          const res = removeGlyphsFromContent(content, info, masks);
          if (!('error' in res) && res.removedGlyphs > 0) {
            const ref = doc.context.register(doc.context.flateStream(res.bytes));
            page.node.set(PDFName.of('Contents'), doc.context.obj([ref]));
            masks.forEach((m, k) => res.removedPerRect[k] > 0 && removedMasks.add(m));
            removedGlyphs += res.removedGlyphs;
          }
        }
      } catch {
        /* the text is covered instead */
      }
    }

    /** Runs `draw` in a local y-up frame placed at `local` (given in view space). */
    const inView = (local: Matrix, draw: () => void, pre: ReturnType<typeof pushGraphicsState>[] = []) => {
      const m = mul(toPdf, local);
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(m[0], m[1], m[2], m[3], m[4], m[5]), ...pre);
      draw();
      page.pushOperators(popGraphicsState());
    };

    const drawRun = (base: Matrix, run: TextRun, pieces: Piece[], style: TextStyle) => {
      const color = hexToRgb(style.color);
      const total = pieces.length > 1 ? measureText(run.text, style) || 1 : 1;
      for (const piece of pieces) {
        if (!piece.text.trim()) continue;
        const text = piece.text.replace(/\t/g, ' ');
        // A run drawn by two fonts keeps each piece where the browser placed it.
        const offset = pieces.length > 1 ? (run.width * measureText(run.text.slice(0, piece.start), style)) / total : 0;
        const width = pieces.length > 1 ? (run.width * measureText(piece.text, style)) / total : run.width;
        const file = fontFiles.get(piece.font);
        if (needsShaping(text)) {
          if (shaper && file) {
            // Draw the glyphs HarfBuzz chose, each at its own position.
            const shaped = shaper.shape(file, text);
            const natural = shaped.advance * run.fontSize;
            const sx = natural > 0 && width > 0 ? clamp(width / natural, 0.5, 2) : 1;
            const ops = [beginText(), setFillingColor(color), setFontAndSize(fontKeyOn(page, piece.font), run.fontSize)];
            if (style.opacity < 1) {
              const gs = page.node.newExtGState('GS', doc.context.obj({ Type: 'ExtGState', ca: style.opacity, CA: style.opacity }));
              ops.unshift(setGraphicsState(gs));
            }
            for (const g of shaped.glyphs) {
              ops.push(
                setTextMatrix(sx, 0, 0, 1, g.x * run.fontSize * sx, g.y * run.fontSize),
                showText(PDFHexString.of(g.gid.toString(16).padStart(4, '0'))),
              );
            }
            // ActualText keeps the logical string available to search and copy.
            const actual = doc.context.obj({ ActualText: PDFHexString.fromText(text) });
            inView(mul(base, mul(translate(run.x + offset, run.baseline), FLIP_Y)), () =>
              page.pushOperators(
                PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('Span'), actual as unknown as PDFName]),
                ...ops,
                endText(),
                endMarkedContent(),
              ),
            );
            shapedRuns++;
            continue;
          }
          unshaped = true;
        }
        const natural = piece.font.widthOfTextAtSize(text, run.fontSize);
        // Squeeze/stretch horizontally so the text occupies exactly the width seen on screen,
        // whatever the metric differences between the browser font and the PDF font.
        const squeeze = natural > 0 && width > 0 ? clamp((width / natural) * 100, 50, 200) : 100;
        const pre = Math.abs(squeeze - 100) > 0.5 ? [setCharacterSqueeze(squeeze)] : [];
        inView(
          mul(base, mul(translate(run.x + offset, run.baseline), FLIP_Y)),
          () => {
            page.drawText(text, { x: 0, y: 0, size: run.fontSize, font: piece.font, color, opacity: style.opacity });
          },
          pre,
        );
      }
      if (style.underline) {
        inView(mul(base, mul(translate(run.x, run.baseline), FLIP_Y)), () => {
          page.drawLine({
            start: { x: 0, y: -run.fontSize * 0.11 },
            end: { x: run.width, y: -run.fontSize * 0.11 },
            thickness: Math.max(0.5, run.fontSize * 0.06),
            color,
            opacity: style.opacity,
          });
        });
      }
    };

    const boxFrame = (o: { x: number; y: number; height: number; rotation?: number }): Matrix =>
      mul(mul(translate(o.x, o.y), rotateDeg(o.rotation ?? 0)), [1, 0, 0, -1, 0, o.height]);

    // Edited original text first (it belongs to the page content), then everything else in z-order.
    const ordered = [...list.filter((o) => o.type === 'textedit'), ...list.filter((o) => o.type !== 'textedit' && o.type !== 'redact')];

    for (const o of ordered) {
      switch (o.type) {
        case 'textedit': {
          const layout = layoutTextEdit(o);
          const pieces = await Promise.all(layout.runs.map((r) => piecesFor(r.text, o.style, pageIndex)));
          const mask = hexToRgb(o.maskColor);
          for (const m of layout.masks) {
            // Text that was really removed needs no cover; the rest is covered as before.
            if (removedMasks.has(m)) continue;
            coveredPages.add(pageIndex);
            inView(boxFrame(m), () => page.drawRectangle({ x: 0, y: 0, width: m.width, height: m.height, color: mask }));
          }
          if (pieces.every(Boolean)) layout.runs.forEach((run, k) => drawRun([1, 0, 0, 1, 0, 0], run, pieces[k]!, o.style));
          break;
        }
        case 'text': {
          const layout = layoutTextObject(o);
          const base = mul(translate(o.x, o.y), rotateDeg(o.rotation));
          const pieces = await Promise.all(layout.lines.map((l) => piecesFor(l.text, o, pageIndex)));
          if (pieces.every(Boolean)) layout.lines.forEach((line, k) => line.text.trim() && drawRun(base, line, pieces[k]!, o));
          break;
        }
        case 'image': {
          const image = await imageFor(o.assetId);
          inView(boxFrame(o), () => page.drawImage(image, { x: 0, y: 0, width: o.width, height: o.height, opacity: o.opacity }));
          break;
        }
        case 'whiteout':
          inView(boxFrame(o), () => page.drawRectangle({ x: 0, y: 0, width: o.width, height: o.height, color: hexToRgb(o.fill) }));
          break;
        case 'highlight': {
          const color = hexToRgb(o.color);
          // Multiply keeps the text under a highlight as dark as it was.
          const blendMode = o.mode === 'highlight' ? BlendMode.Multiply : undefined;
          for (const r of markShapes(o)) {
            inView(boxFrame(r), () => page.drawRectangle({ x: 0, y: 0, width: r.width, height: r.height, color, opacity: o.opacity, blendMode }));
          }
          break;
        }
        case 'rect':
        case 'ellipse': {
          const common = {
            color: o.fill ? hexToRgb(o.fill) : undefined,
            borderColor: o.stroke && o.strokeWidth > 0 ? hexToRgb(o.stroke) : undefined,
            borderWidth: o.stroke ? o.strokeWidth : 0,
            opacity: o.fill ? o.opacity : undefined,
            borderOpacity: o.stroke ? o.opacity : undefined,
          };
          inView(boxFrame(o), () => {
            if (o.type === 'rect') page.drawRectangle({ x: 0, y: 0, width: o.width, height: o.height, ...common });
            else page.drawEllipse({ x: o.width / 2, y: o.height / 2, xScale: o.width / 2, yScale: o.height / 2, ...common });
          });
          break;
        }
        case 'line':
        case 'arrow': {
          const [x1, y1, x2, y2] = o.points;
          const color = hexToRgb(o.stroke);
          const len = Math.hypot(x2 - x1, y2 - y1) || 1;
          const ux = (x2 - x1) / len;
          const uy = (y2 - y1) / len;
          const head = o.type === 'arrow' ? arrowHeadSize(o.strokeWidth) : 0;
          // The shaft stops inside the head so the tip stays sharp.
          const ex = x2 - ux * head * 0.6;
          const ey = y2 - uy * head * 0.6;
          inView(FLIP_Y, () => {
            page.drawSvgPath(`M ${x1} ${y1} L ${o.type === 'arrow' ? ex : x2} ${o.type === 'arrow' ? ey : y2}`, {
              x: 0, y: 0, borderColor: color, borderWidth: o.strokeWidth, borderOpacity: o.opacity,
              borderLineCap: o.type === 'arrow' ? LineCapStyle.Butt : LineCapStyle.Round,
            });
            if (o.type === 'arrow') {
              const bx = x2 - ux * head;
              const by = y2 - uy * head;
              const nx = (-uy * head) / 2;
              const ny = (ux * head) / 2;
              page.drawSvgPath(`M ${x2} ${y2} L ${bx + nx} ${by + ny} L ${bx - nx} ${by - ny} Z`, {
                x: 0, y: 0, color, opacity: o.opacity, borderWidth: 0,
              });
            }
          });
          break;
        }
        case 'path': {
          const p = o.points;
          let d = `M ${p[0]} ${p[1]}`;
          if (p.length === 2) d += ` L ${p[0] + 0.01} ${p[1]}`;
          for (let k = 2; k + 1 < p.length; k += 2) d += ` L ${p[k]} ${p[k + 1]}`;
          inView(
            FLIP_Y,
            () =>
              page.drawSvgPath(d, {
                x: 0, y: 0, borderColor: hexToRgb(o.stroke), borderWidth: o.strokeWidth,
                borderOpacity: o.opacity, borderLineCap: LineCapStyle.Round,
              }),
            [setLineJoin(LineJoinStyle.Round)],
          );
          break;
        }
      }
      written++;
    }
  }

  if (unsupported.length) {
    throw new ExportError('Some text uses characters the selected font cannot draw. Nothing was exported.', [...new Set(unsupported)]);
  }

  if (usedFallback) warnings.push('Characters missing from the chosen font were drawn with the bundled Noto Sans font.');
  if (unshaped) {
    warnings.push(
      'Some text is in a script that needs letter joining (for example Hindi or Arabic) but could not be shaped, ' +
        'either because the shaping engine did not load or because the text uses a standard font. Check those lines in the result.',
    );
  }
  if (rightToLeft) {
    warnings.push('Right-to-left text was shaped line by line. Lines that mix it with numbers or Latin words may be ordered incorrectly.');
  }
  if (coveredPages.size) {
    warnings.push(
      `On page ${[...coveredPages].map((p) => p + 1).join(', ')} some replaced text could not be taken out of the file and was covered instead. ` +
        'It is hidden but can still be found by search. Use Secure redact if it must be removed.',
    );
  }

  onProgress?.(pageIndexes.length, pageIndexes.length, 'Saving PDF');
  let bytes: Uint8Array;
  try {
    bytes = await doc.save();
  } catch (e: any) {
    throw new ExportError(`The edited PDF could not be serialised: ${e?.message ?? e}`);
  }

  // Validation: the result must parse again and keep every page.
  try {
    const check = await PDFDocument.load(bytes, { updateMetadata: false });
    if (check.getPageCount() !== input.pages.length) throw new Error('page count changed');
  } catch (e: any) {
    throw new ExportError(`The exported PDF failed validation (${e?.message ?? e}). Nothing was downloaded.`);
  }

  return { bytes, pagesModified: pageIndexes.length, objectsWritten: written, flattenedPages, removedGlyphs, shapedRuns, structureChanged, warnings };
}

/**
 * Makes the document's pages match the editor's page list: order, deleted pages, blank
 * pages, pages taken from other PDFs and rotation. The document is changed in place, so
 * bookmarks, form fields and metadata of the original survive. Returns true if anything changed.
 */
async function applyPageStructure(doc: PDFDocument, input: ExportInput): Promise<boolean> {
  const originals = doc.getPages();
  const slots = input.pages;
  for (const p of slots) {
    if (p.source === 'main' && !originals[p.srcIndex]) throw new ExportError('The page list refers to a page the PDF does not have.');
    if (p.source !== 'main' && p.source !== 'blank' && !input.sources?.[p.source]) {
      throw new ExportError(`The PDF that page ${p.index + 1} was added from is no longer available.`);
    }
  }
  const sameOrder = slots.length === originals.length && slots.every((p, i) => p.source === 'main' && p.srcIndex === i);
  if (!sameOrder) {
    // A page taken out of its place in the page tree must carry what it inherited from there.
    for (const pg of originals) {
      for (const key of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) {
        const name = PDFName.of(key);
        if (!pg.node.has(name)) {
          const inherited = pg.node.getInheritableAttribute(name);
          if (inherited) pg.node.set(name, inherited);
        }
      }
    }
    for (let i = originals.length - 1; i >= 0; i--) doc.removePage(i);

    const copied = new Map<string, PDFPage>();
    for (const source of new Set(slots.map((p) => p.source))) {
      if (source === 'main' || source === 'blank') continue;
      let src: PDFDocument;
      try {
        src = await PDFDocument.load(input.sources![source], { updateMetadata: false });
      } catch (e: any) {
        throw new ExportError(`An added PDF could not be read for export: ${e?.message ?? e}`);
      }
      const wanted = slots.filter((p) => p.source === source).map((p) => p.srcIndex);
      const pages = await doc.copyPages(src, wanted);
      wanted.forEach((idx, k) => copied.set(`${source}:${idx}`, pages[k]));
    }

    const kept = new Set<number>();
    for (const p of slots) {
      if (p.source === 'main') {
        kept.add(p.srcIndex);
        doc.addPage(originals[p.srcIndex]);
      } else if (p.source === 'blank') {
        doc.addPage([p.viewBox[2] - p.viewBox[0], p.viewBox[3] - p.viewBox[1]]);
      } else {
        doc.addPage(copied.get(`${p.source}:${p.srcIndex}`)!);
      }
    }
    // Deleted pages: remove the page object and its content so their text is not left in the file.
    originals.forEach((pg, i) => {
      if (kept.has(i)) return;
      const contents = pg.node.get(PDFName.of('Contents'));
      const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
      for (const r of refs) if (r instanceof PDFRef) doc.context.delete(r);
      doc.context.delete(pg.ref);
    });
  }
  let rotated = false;
  slots.forEach((p, i) => {
    if (!p.userRotation) return;
    doc.getPage(i).setRotation(degrees(p.rotation));
    rotated = true;
  });
  return !sameOrder || rotated;
}

/** Decoded content of a page (all its content streams joined), or null if it cannot be read. */
function readPageContent(doc: PDFDocument, page: PDFPage): Uint8Array | null {
  const contents = page.node.Contents();
  if (!contents) return null;
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
  const parts: Uint8Array[] = [];
  for (const s of streams) {
    if (!(s instanceof PDFRawStream)) return null;
    parts.push(decodePDFRawStream(s).decode());
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length + 1, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
    out[off++] = 10; // streams are separated by white space
  }
  return out;
}

/** Arrow head length (= width) used by both the screen renderer and the exporter. */
export const arrowHeadSize = (strokeWidth: number) => Math.max(8, strokeWidth * 4);

/** Convenience for callers that only have a PDFPage (tests): derive PageInfo like PDF.js would. */
export function pageInfoFromPdfLib(page: PDFPage, index: number): PageInfo {
  const crop = page.getCropBox();
  return makePageInfo(
    {
      id: `main:${index}`, source: 'main', srcIndex: index, userUnit: 1, baseRotation: page.getRotation().angle,
      viewBox: [crop.x, crop.y, crop.x + crop.width, crop.y + crop.height],
    },
    index,
  );
}
