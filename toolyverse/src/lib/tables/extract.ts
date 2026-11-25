/**
 * PDF to tables, page by page: pages with real text are read directly, scanned pages with OCR,
 * then tables are found on each page and, when asked, joined where one runs onto the next page.
 * Stages are reported as they really happen; nothing is simulated.
 */
import type { PdfDoc } from '../pdf/render';
import { languageByCode, type Script } from '../lang';
import { detectTables, shadeCells } from './detect';
import { joinAcrossPages } from './join';
import { readDigitalPage, readScannedPage, readTextPage, type IndicCheck, type PageRead } from './pdf';
import type { Table } from './types';

export interface ExtractOptions {
  /** 'auto' reads scanned pages with OCR, 'always' reads every page with OCR, 'never' skips scans. */
  ocr: 'auto' | 'always' | 'never';
  /** Language codes from lib/lang, or 'auto' to detect each scanned page's script. */
  languages: string[] | 'auto';
  mode: 'auto' | 'ruled' | 'aligned';
  join: boolean;
}

export interface PageInfo {
  index: number;
  width: number;
  height: number;
  scanned: boolean;
  scripts: Script[];
  ocr?: PageRead['ocr'];
  tables: number;
}

export interface Extraction {
  tables: Table[];
  pages: PageInfo[];
  warnings: string[];
  joined: string[];
}

export class Cancelled extends Error {
  constructor() {
    super('Stopped.');
  }
}

/** Below this many characters a page is taken to be a scan. */
const SCANNED_BELOW = 12;

export async function extractTables(doc: PdfDoc, opts: ExtractOptions, onStage: (stage: string, f?: number) => void, signal?: AbortSignal): Promise<Extraction> {
  const tables: Table[] = [];
  const pages: PageInfo[] = [];
  const warnings: string[] = [];
  const indicCheck: IndicCheck = { checked: 0 };
  const models = opts.languages === 'auto' ? 'auto' : [...new Set(['eng', ...opts.languages.map((c) => languageByCode.get(c)?.model).filter((m): m is string => !!m)])];
  if (opts.languages !== 'auto')
    for (const c of opts.languages) {
      const l = languageByCode.get(c);
      if (l?.note) warnings.push(`${l.name}: ${l.note}`);
    }

  for (let i = 0; i < doc.numPages; i++) {
    if (signal?.aborted) throw new Cancelled();
    onStage(`Analysing page ${i + 1} of ${doc.numPages}`, i / doc.numPages);
    let read = await readDigitalPage(doc, i);
    const scan = opts.ocr === 'always' || (opts.ocr === 'auto' && read.chars < SCANNED_BELOW);
    // A page with real text: its Indian-language text is checked, and read with OCR when the PDF stored it wrongly.
    if (!scan && opts.ocr === 'auto') {
      try {
        const checked = await readTextPage(doc, i, read, indicCheck, { models, onProgress: (f) => onStage(`Checking the text of page ${i + 1} with OCR: ${Math.round(f * 100)}%`, (i + f) / doc.numPages) });
        read = checked.read;
        if (checked.reason) warnings.push(checked.reason);
      } catch {
        // OCR could not run: keep the PDF's own text.
      }
    } else if (!scan && read.brokenIndic > 0.05) warnings.push(`Page ${i + 1}: the PDF stores its Indian-language text with letters out of order; check that text, as OCR is switched off.`);
    if (read.legacyFonts.length && opts.ocr !== 'always')
      warnings.push(`Page ${i + 1} uses an old non-Unicode font (${read.legacyFonts.slice(0, 2).join(', ')}): its Indian-language text comes out as Latin letters. Choose "Read every page with OCR" and the language to get Unicode text.`);
    if (read.chars < SCANNED_BELOW && opts.ocr === 'never') warnings.push(`Page ${i + 1} is a scan and was skipped (OCR is switched off).`);
    if (scan) {
      onStage(`Reading page ${i + 1} of ${doc.numPages} with OCR`, i / doc.numPages);
      try {
        read = await readScannedPage(doc, i, { models, onProgress: (f) => onStage(`Reading page ${i + 1} of ${doc.numPages} with OCR: ${Math.round(f * 100)}%`, (i + f) / doc.numPages) });
        if (read.ocr?.rotated) warnings.push(`Page ${i + 1} was scanned ${read.ocr.rotated === 180 ? 'upside down' : 'sideways'}; it was turned upright before reading.`);
        if (read.ocr && read.ocr.confidence < 70) warnings.push(`Page ${i + 1}: the scan was hard to read (OCR certainty ${read.ocr.confidence}%). Check its values.`);
        if (opts.languages === 'auto' && read.ocr && !read.ocr.script) warnings.push(`Page ${i + 1}: the script could not be detected, so it was read as English. Choose the language if it is not English.`);
        if (read.ocr?.script && !read.ocr.script.split(' and ').every((s) => ['Latin', 'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Arabic'].includes(s)))
          warnings.push(`Page ${i + 1} is in ${read.ocr.script} script, which has no OCR model here; its text may be missing or wrong.`);
      } catch (e) {
        if (signal?.aborted) throw new Cancelled();
        warnings.push(`Page ${i + 1} could not be read with OCR: ${(e as Error).message}`);
      }
    }
    if (signal?.aborted) throw new Cancelled();
    onStage(`Finding tables on page ${i + 1}`, (i + 1) / doc.numPages);
    const found = detectTables(read, { mode: opts.mode }).tables;
    if (read.fills?.length) shadeCells(found, read.fills);
    tables.push(...found);
    pages.push({ index: i, width: read.width, height: read.height, scanned: !!read.scanned, scripts: read.scripts, ocr: read.ocr, tables: found.length });
  }

  let joined: string[] = [];
  let out = tables;
  if (opts.join) {
    onStage('Joining tables that continue across pages');
    const r = joinAcrossPages(tables, (p) => pages[p]?.width ?? 595, (p) => pages[p]?.height ?? 842);
    out = r.tables;
    joined = r.joined;
  }
  out.forEach((t, k) => {
    t.id = `t${k + 1}`;
    t.name = t.pages.length > 1 ? `Table ${k + 1} (pages ${t.pages[0] + 1}-${t.pages[t.pages.length - 1] + 1})` : `Table ${k + 1} (page ${t.pages[0] + 1})`;
  });
  if (!out.length) warnings.push('No tables were found. Try "Unruled tables only" or "Ruled tables only", or OCR for a scanned file.');
  return { tables: out, pages, warnings, joined };
}
