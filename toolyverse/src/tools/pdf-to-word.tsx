'use client';

import { useEffect, useRef, useState } from 'react';
import { zipStore } from '@editor/engines/PdfTools';
import { isPasswordError, openPdf, type PdfDoc } from '@/lib/pdf/render';
import type { PageIn, PageOut, Span } from '@/lib/pdf/word/layout';
import type { Table, Word } from '@/lib/tables/types';
import { languageByCode, type Script } from '@/lib/lang';
import { stopOcr } from '@/lib/ocr';
import { Bench, FileDrop, Notice, Segmented, baseName, download, formatSize, type ToolProps } from './kit';
import { NeedsPassword, useQueue } from './docs/queue';
import { JobList } from './docs/JobList';
import { LanguagePicker, type LangChoice } from './docs/LanguagePicker';
import { PageView } from './docs/PageView';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
type Mode = 'layout' | 'editable' | 'ocr' | 'tables';

interface Result {
  doc: PdfDoc;
  bytes: Uint8Array;
  pages: PageOut[];
  rotations: number[];
  stats: { pages: number; tables: number; pictures: number; ocrPages: number; lowWords: number; scripts: Script[]; header: boolean; footer: boolean };
  warnings: string[];
}

const isPdf = (b: Uint8Array) => new TextDecoder('latin1').decode(b.subarray(0, 1024)).includes('%PDF');

/** Opens the finished file again and checks its main part is well-formed before it is offered. */
async function checkDocx(bytes: Uint8Array) {
  const JSZip = (await import('jszip')).default;
  const { parseXml } = await import('@/lib/xml');
  const zip = await JSZip.loadAsync(bytes);
  const main = await zip.file('word/document.xml')?.async('string');
  if (!main) throw new Error('The Word file came out incomplete. Please try again.');
  const r = parseXml(main);
  if (!r.root || r.root.name !== 'w:document' || r.problems.length) throw new Error('The Word file came out damaged. Please try again or report this file.');
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function PdfToWord(props: ToolProps) {
  const ocrAllowed = props.features.ocr !== false;
  const [mode, setMode] = useState<Mode>('layout');
  const [langs, setLangs] = useState<LangChoice>('auto');
  const [selected, setSelected] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const settings = useRef({ mode, langs, ocrAllowed });
  useEffect(() => {
    settings.current = { mode, langs, ocrAllowed };
  });

  const q = useQueue<Result>(async (job, report, signal) => {
    const { mode, langs, ocrAllowed } = settings.current;
    const bytes = new Uint8Array(await job.file.arrayBuffer());
    if (!isPdf(bytes)) throw new Error('This file is not a PDF.');
    report('Opening the PDF');
    let doc: PdfDoc;
    try {
      doc = await openPdf(bytes, job.password);
    } catch (e) {
      if (await isPasswordError(e)) throw new NeedsPassword(!!job.password);
      throw new Error('This PDF is damaged and cannot be read.');
    }
    try {
      const { readPage } = await import('@/lib/pdf/word/extract');
      const { readDigitalPage, readScannedPage, readTextPage, patchIndic } = await import('@/lib/tables/pdf');
      const indicCheck = { checked: 0 };
      const { detectTables, pageFrame } = await import('@/lib/tables/detect');
      const { layoutPage, bodySize, takeRunningHeads, markLines } = await import('@/lib/pdf/word/layout');
      const { buildDocx } = await import('@/lib/pdf/word/docx');
      const models = langs === 'auto' ? 'auto' : [...new Set(['eng', ...langs.map((c) => languageByCode.get(c)?.model).filter((m): m is string => !!m)])];
      const warnings: string[] = [];
      if (langs !== 'auto') for (const c of langs) if (languageByCode.get(c)?.note) warnings.push(`${languageByCode.get(c)!.name}: ${languageByCode.get(c)!.note}`);
      const pages: { page: PageIn; tables: Table[]; frame?: { x0: number; y0: number; x1: number; y1: number } }[] = [];
      const rotations: number[] = [];
      const scripts = new Set<Script>();
      let ocrPages = 0;
      let lowWords = 0;
      for (let i = 0; i < doc.numPages; i++) {
        if (signal.aborted) throw new Error('Stopped.');
        report(`Analysing page ${i + 1} of ${doc.numPages}`, i / doc.numPages);
        let digital = await readDigitalPage(doc, i);
        digital.scripts.forEach((s) => scripts.add(s));
        if (digital.legacyFonts.length && mode !== 'ocr') warnings.push(`Page ${i + 1} uses an old non-Unicode font (${digital.legacyFonts.slice(0, 2).join(', ')}); its Indian-language text comes out as Latin letters. Choose the OCR mode and the language for Unicode text.`);
        const scanned = ocrAllowed && (mode === 'ocr' || digital.chars < 12);
        // Indian-language text the PDF stored wrongly: those words are read from the page with OCR,
        // the rest of the page (fonts, colours, tables, lines) stays as the PDF has it.
        let ocrWords: Word[] | undefined;
        if (!scanned && ocrAllowed && digital.chars >= 12) {
          const checked = await readTextPage(doc, i, digital, indicCheck, { models, onProgress: (f) => report(`Checking the text of page ${i + 1} with OCR: ${Math.round(f * 100)}%`, (i + f) / doc.numPages) }).catch(() => ({ read: digital, reason: undefined, ocr: undefined }));
          if (checked.ocr) {
            digital = checked.read;
            ocrWords = checked.ocr;
            if (checked.reason) warnings.push(checked.reason);
          }
        } else if (!ocrAllowed && digital.brokenIndic > 0.05) warnings.push(`Page ${i + 1}: the PDF stores its Indian-language text with letters out of order; check the text, as OCR is switched off.`);
        if (scanned) {
          report(`Reading page ${i + 1} of ${doc.numPages} with OCR`, i / doc.numPages);
          const sp = await readScannedPage(doc, i, { models, onProgress: (f) => report(`Reading page ${i + 1} of ${doc.numPages} with OCR: ${Math.round(f * 100)}%`, (i + f) / doc.numPages) });
          ocrPages++;
          sp.scripts.forEach((s) => scripts.add(s));
          if (sp.ocr?.rotated) warnings.push(`Page ${i + 1} was scanned ${sp.ocr.rotated === 180 ? 'upside down' : 'sideways'}; it was turned upright.`);
          if (sp.ocr && sp.ocr.confidence < 70) warnings.push(`Page ${i + 1}: the scan was hard to read (OCR certainty ${sp.ocr.confidence}%).`);
          const tables = detectTables(sp).tables;
          const spans: Span[] = sp.words.map((w) => ({ str: `${w.text} `, x: w.box.x0, y: w.box.y1 - w.size * 0.2, w: w.box.x1 - w.box.x0, size: Math.round(w.size * 2) / 2, font: 'Arial', bold: false, italic: false, low: (w.conf ?? 100) < 60 }));
          lowWords += spans.filter((s) => s.low).length;
          pages.push({ page: { width: sp.width, height: sp.height, spans, images: [] }, tables });
          rotations.push(sp.ocr?.rotated ?? 0);
        } else {
          if (digital.chars < 12) warnings.push(`Page ${i + 1} is a scan; OCR is switched off, so it is kept as a picture.`);
          const tables = detectTables(digital).tables;
          report(`Reading text and pictures on page ${i + 1}`, (i + 0.5) / doc.numPages);
          const rp = await readPage(doc, i, { graphics: mode === 'layout', mask: tables.map((t) => t.box), pictures: mode !== 'tables' });
          if (rp.hiddenText) rp.images = rp.images.filter((img) => img.graphics || img.w * img.h < rp.width * rp.height * 0.8);
          if (ocrWords) {
            const n = patchIndic(rp.spans, ocrWords, (sp) => ({ text: sp.str, box: { x0: sp.x, y0: sp.y - sp.size * 0.85, x1: sp.x + sp.w, y1: sp.y + sp.size * 0.25 } }), (sp, t) => (sp.str = t));
            if (n) ocrPages++;
          }
          // Underlines, and blanks to fill in drawn as lines (outside the tables).
          markLines(rp, digital.segments, tables.map((t) => t.box), mode !== 'layout');
          // A frame round the page becomes a page border (in the picture of the page's drawings otherwise).
          pages.push({ page: rp, tables, frame: mode === 'layout' ? undefined : pageFrame(digital)?.box });
          rotations.push(0);
        }
      }
      if (signal.aborted) throw new Error('Stopped.');
      report('Writing the Word file', 0.98);
      const heads = mode === 'tables' ? { headers: [], footers: [] } : takeRunningHeads(pages.map((p) => p.page));
      const body = bodySize(pages.map((p) => p.page));
      const outs = pages.map((p) => layoutPage(p.page, body, { tables: p.tables, editable: mode !== 'layout' && mode !== 'ocr', frame: p.frame }));
      const docx = buildDocx(outs, { title: baseName(job.file.name), headers: heads.headers, footers: heads.footers });
      report('Checking the Word file', 0.99);
      await checkDocx(docx);
      if (ocrPages) stopOcr();
      return {
        doc,
        bytes: docx,
        pages: outs,
        rotations,
        warnings,
        stats: { pages: doc.numPages, tables: pages.reduce((n, p) => n + p.tables.length, 0), pictures: outs.reduce((n, p) => n + p.images.filter((i) => !i.graphics).length, 0), ocrPages, lowWords, scripts: [...scripts], header: heads.headers.length > 0, footer: heads.footers.length > 0 },
      };
    } catch (e) {
      void doc.destroy();
      throw e;
    }
  });

  const job = q.jobs.find((j) => j.id === selected && j.status === 'done');
  const res = job?.result;
  const done = q.jobs.filter((j) => j.status === 'done');

  const saveAll = () => {
    setError(null);
    try {
      const names = new Set<string>();
      const files = done.map((j) => {
        let n = `${baseName(j.file.name)}.docx`;
        for (let k = 2; names.has(n); k++) n = `${baseName(j.file.name)} (${k}).docx`;
        names.add(n);
        return { name: n, bytes: j.result!.bytes };
      });
      download(zipStore(files), 'pdf-to-word.zip', 'application/zip');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <Bench>
        <FileDrop accept="application/pdf,.pdf" multiple onFiles={(f) => q.add(f)} props={props} label={q.jobs.length ? 'Add more PDFs' : 'Choose PDF files'} hint="converted on your device" />
        <div className="mt-4 grid gap-4 border-t border-rule pt-4 lg:grid-cols-2">
          <div>
            <Segmented
              label="Mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'layout', label: 'Keep the layout' },
                { value: 'editable', label: 'Editable text' },
                ...(ocrAllowed ? [{ value: 'ocr' as Mode, label: 'OCR every page' }] : []),
                { value: 'tables', label: 'Tables and text only' },
              ]}
            />
            <p className="mt-2 text-[0.8rem] text-ink-3">
              {mode === 'layout'
                ? 'Text, tables and pictures where they were on the page; lines and boxes kept as a picture behind the text.'
                : mode === 'editable'
                  ? 'Flowing paragraphs, Word tables and pictures, without the exact line positions: easiest to edit.'
                  : mode === 'ocr'
                    ? 'Reads every page as an image, for scans and for PDFs whose text comes out garbled (old Hindi fonts).'
                    : 'Only the text and the tables as Word tables, without pictures or page decoration.'}
            </p>
          </div>
          <div>{ocrAllowed && <LanguagePicker value={langs} onChange={setLangs} />}</div>
        </div>
        {q.jobs.some((j) => j.status === 'done' || j.status === 'failed') && (
          <button type="button" className="btn btn-ghost mt-3 !min-h-9 text-sm" onClick={() => q.retryAll()}>
            Convert all files again with these settings
          </button>
        )}
      </Bench>

      {q.jobs.length > 0 && (
        <JobList
          jobs={q.jobs}
          selected={selected}
          onSelect={(id) => (setSelected(id), setPage(0))}
          onRemove={(id) => {
            void q.jobs.find((x) => x.id === id)?.result?.doc.destroy();
            if (selected === id) setSelected(null);
            q.remove(id);
          }}
          onRetry={q.retry}
          onCancel={q.cancel}
          onPassword={q.setPassword}
          summary={(j) => {
            const s = (j.result as Result).stats;
            return `${plural(s.pages, 'page')}, ${plural(s.tables, 'table')}, ${formatSize((j.result as Result).bytes.length)}`;
          }}
        />
      )}

      {done.length > 0 && (
        <Bench>
          <div className="flex flex-wrap gap-2">
            {job && (
              <button type="button" className="btn" onClick={() => download(job.result!.bytes, `${baseName(job.file.name)}.docx`, DOCX)}>
                Download Word: {baseName(job.file.name)}
              </button>
            )}
            {done.length > 1 && (
              <button type="button" className="btn btn-ghost" onClick={saveAll}>
                Download all {done.length} (ZIP)
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                for (const j of q.jobs) void j.result?.doc.destroy();
                q.clear();
                setSelected(null);
              }}
            >
              Clear all
            </button>
          </div>
          {error && <Notice tone="bad">{error}</Notice>}
          {!job && <p className="mt-2 text-sm text-ink-2">Choose Review next to a file to compare its pages with the converted text before downloading.</p>}
          <p className="mt-2 text-[0.8rem] text-ink-3">Each Word file is opened again and checked before it is offered. It opens in Microsoft Word, WPS Office, LibreOffice and Google Docs.</p>
        </Bench>
      )}

      {job && res && (
        <Bench>
          <p className="label">
            {plural(res.stats.pages, 'page')} · {plural(res.stats.tables, 'Word table')} · {plural(res.stats.pictures, 'picture')}{res.stats.ocrPages ? ` · ${plural(res.stats.ocrPages, 'page')} read with OCR` : ''}
            {res.stats.lowWords ? ` · ${res.stats.lowWords} uncertain words marked yellow` : ''}
            {res.stats.header || res.stats.footer ? ` · repeated ${[res.stats.header && 'header', res.stats.footer && 'footer'].filter(Boolean).join(' and ')} moved to Word's own` : ''}
            {res.stats.scripts.length ? ` · scripts: ${res.stats.scripts.join(', ')}` : ''}
          </p>
          {res.warnings.map((w, i) => (
            <Notice key={i} tone="warn">
              {w}
            </Notice>
          ))}
          <div className="mt-3 grid gap-4 xl:grid-cols-2">
            <div>
              <p className="label mb-1">Original</p>
              <PageView doc={res.doc} page={page} pages={res.stats.pages} onPage={setPage} rotate={res.rotations[page] ?? 0} />
            </div>
            <div>
              <p className="label mb-1">Converted (text and tables of this page)</p>
              <PagePreview page={res.pages[page]} />
            </div>
          </div>
        </Bench>
      )}
    </div>
  );
}

/** The converted page as Word will show its text and tables (pictures left out of the preview). */
function PagePreview({ page }: { page?: PageOut }) {
  if (!page) return null;
  return (
    <div className="max-h-[40rem] overflow-auto border border-rule bg-white p-4 text-[#1a1a1a]">
      {!page.paras.length && <p className="text-sm text-[#666]">No text on this page.</p>}
      {page.paras.map((p, i) =>
        p.table ? (
          <table key={i} className="my-2 border-collapse text-[0.8rem]">
            <tbody>
              {p.table.table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((c, k) =>
                    c.hidden ? null : (
                      <td key={k} rowSpan={c.rowSpan} colSpan={c.colSpan} dir="auto" className={`border border-[#999] px-1 align-top whitespace-pre-wrap ${r < p.table!.table.headerRows ? 'font-semibold' : ''}`} style={{ background: (c.conf ?? 100) < 60 ? '#fff2b3' : undefined }}>
                        {c.text}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p key={i} dir={p.rtl ? 'rtl' : 'auto'} style={{ textAlign: p.align === 'both' ? 'justify' : p.align, marginTop: Math.min(p.before, 18), paddingLeft: p.rtl ? 0 : Math.min(p.left, 200) }} className={p.heading ? 'font-semibold' : ''}>
            {p.colBreak && <span className="mb-1 block border-t border-dashed border-[#999] text-[0.7rem] text-[#666]">second column</span>}
            {p.bullet ? '• ' : ''}
            {p.runs.map((r, k) =>
              r.tab ? (
                <span key={k}>{' '}</span>
              ) : (
                <span key={k} style={{ fontWeight: r.bold ? 700 : undefined, fontStyle: r.italic ? 'italic' : undefined, fontSize: `${Math.max(9, Math.min(r.size, 28))}px`, color: r.color ? `#${r.color}` : undefined, textDecoration: r.underline || r.link ? 'underline' : undefined, background: r.low ? '#fff2b3' : undefined }}>
                  {r.text}
                </span>
              ),
            )}
          </p>
        ),
      )}
    </div>
  );
}
