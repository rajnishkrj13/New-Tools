'use client';

import { useState } from 'react';
import { OCR_LANGS, stopOcr, type OcrLang } from '@/lib/ocr';
import { isPasswordError, type PdfDoc } from '@/lib/pdf/render';
import { Bench, FileDrop, Notice, Segmented, Spinner, baseName, download, formatSize, type ToolProps } from './kit';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface Loaded {
  file: File;
  bytes: Uint8Array;
  doc: PdfDoc;
  /** Pages (from 0) with almost no text: scans. */
  scanned: number[];
}

export default function PdfToWord(props: ToolProps) {
  const ocrAllowed = props.features.ocr !== false;
  const [pending, setPending] = useState<{ file: File; bytes: Uint8Array } | null>(null);
  const [pw, setPw] = useState('');
  const [wrongPw, setWrongPw] = useState(false);
  const [pdf, setPdf] = useState<Loaded | null>(null);
  const [scans, setScans] = useState<'ocr' | 'picture'>(ocrAllowed ? 'ocr' : 'picture');
  const [lang, setLang] = useState<OcrLang>('eng');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = async (file: File, bytes: Uint8Array, password?: string) => {
    setError(null);
    setDone(null);
    setBusy('Reading the PDF…');
    try {
      if (!new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF')) throw new Error('This file is not a PDF.');
      const { openPdf, textPerPage, SCANNED_BELOW } = await import('@/lib/pdf/word/extract');
      let doc: PdfDoc;
      try {
        doc = await openPdf(bytes, password);
      } catch (e) {
        if (await isPasswordError(e)) {
          setPending({ file, bytes });
          setWrongPw(!!password);
          return;
        }
        throw new Error('This file is not a readable PDF. It may be damaged.');
      }
      const counts = await textPerPage(doc);
      setPending(null);
      setPw('');
      setPdf({ file, bytes, doc, scanned: counts.flatMap((n, i) => (n < SCANNED_BELOW ? [i] : [])) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const reset = () => {
    void pdf?.doc.destroy();
    setPdf(null);
    setPending(null);
    setPw('');
    setDone(null);
    setError(null);
  };

  const convert = async () => {
    if (!pdf) return;
    setError(null);
    setDone(null);
    const { readPage, ocrPage } = await import('@/lib/pdf/word/extract');
    const { layoutPage, bodySize } = await import('@/lib/pdf/word/layout');
    const { buildDocx } = await import('@/lib/pdf/word/docx');
    const n = pdf.doc.numPages;
    const scanned = new Set(pdf.scanned);
    const useOcr = ocrAllowed && scans === 'ocr';
    let ocrPages = 0;
    let pictures = 0;
    try {
      const pages = [];
      for (let i = 0; i < n; i++) {
        if (scanned.has(i) && useOcr) {
          const label = `Reading the text of scanned page ${i + 1} of ${n}`;
          setBusy(`${label}…`);
          pages.push(await ocrPage(pdf.doc, i, lang, (f) => setBusy(`${label}: ${Math.round(f * 100)}%`)));
          ocrPages++;
        } else {
          setBusy(`Converting page ${i + 1} of ${n}…`);
          const page = await readPage(pdf.doc, i);
          // A scan with a hidden text layer: keep the text, drop the page-sized picture under it.
          if (page.hiddenText) page.images = page.images.filter((img) => img.graphics || img.w * img.h < page.width * page.height * 0.8);
          pictures += page.images.filter((img) => !img.graphics).length;
          pages.push(page);
        }
      }
      setBusy('Writing the Word file…');
      const body = bodySize(pages);
      const docx = buildDocx(
        pages.map((p) => layoutPage(p, body)),
        { title: baseName(pdf.file.name) },
      );
      const name = `${baseName(pdf.file.name)}.docx`;
      download(docx, name, DOCX);
      const parts = [`${n} ${n === 1 ? 'page' : 'pages'}`];
      if (pictures) parts.push(`${pictures} ${pictures === 1 ? 'picture' : 'pictures'}`);
      if (ocrPages) parts.push(`${ocrPages} scanned ${ocrPages === 1 ? 'page' : 'pages'} read with OCR`);
      setDone(`Saved ${name} (${formatSize(docx.length)}): ${parts.join(', ')}.`);
    } catch (e) {
      setError(`The conversion stopped: ${(e as Error).message || 'the PDF could not be read'}.`);
    } finally {
      if (ocrPages) stopOcr();
      setBusy('');
    }
  };

  if (pending)
    return (
      <Bench>
        <p className="label">
          {pending.file.name} · {formatSize(pending.file.size)}
        </p>
        <form
          className="mt-4 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            if (pw) void load(pending.file, pending.bytes, pw);
          }}
        >
          <label htmlFor="p2w-pw" className="label mb-1 block">
            This PDF has a password. Enter it to convert.
          </label>
          <input id="p2w-pw" type="password" className="field" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          <div className="mt-3 flex gap-2">
            <button type="submit" className="btn" disabled={!pw || !!busy}>
              Open
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Another PDF
            </button>
          </div>
          {wrongPw && !busy && <Notice tone="bad">That password does not open this PDF. Passwords are case-sensitive.</Notice>}
        </form>
        {busy && <Spinner text={busy} />}
      </Bench>
    );

  if (!pdf)
    return (
      <>
        <FileDrop accept="application/pdf,.pdf" onFiles={async (f) => load(f[0], new Uint8Array(await f[0].arrayBuffer()))} props={props} label="Choose a PDF" hint="converted on your device" />
        {busy && <Spinner text={busy} />}
        {error && <Notice tone="bad">{error}</Notice>}
      </>
    );

  const n = pdf.doc.numPages;
  const allScanned = pdf.scanned.length === n;

  return (
    <Bench>
      <p className="label">
        {pdf.file.name} · {n} {n === 1 ? 'page' : 'pages'} · {formatSize(pdf.file.size)}
      </p>

      {pdf.scanned.length > 0 && (
        <div className="mt-4">
          <Notice tone="warn">
            {allScanned
              ? 'This PDF is a scan: its pages are pictures of text.'
              : `${pdf.scanned.length} of the ${n} pages ${pdf.scanned.length === 1 ? 'is a scan' : 'are scans'} (page ${pdf.scanned
                  .slice(0, 8)
                  .map((i) => i + 1)
                  .join(', ')}${pdf.scanned.length > 8 ? '…' : ''}).`}{' '}
            {ocrAllowed ? 'Recognise the text (OCR) to get words you can edit, or keep those pages as pictures.' : 'Those pages are kept as pictures.'}
          </Notice>
          {ocrAllowed && (
            <div className="mt-3 flex flex-wrap gap-4">
              <Segmented
                label="Scanned pages"
                value={scans}
                onChange={setScans}
                options={[
                  { value: 'ocr', label: 'Editable text (OCR)' },
                  { value: 'picture', label: 'Keep as pictures' },
                ]}
              />
              {scans === 'ocr' && <Segmented label="Language" value={lang} onChange={setLang} options={OCR_LANGS} />}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={!!busy} onClick={convert}>
          Convert to Word
        </button>
        <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={reset}>
          Another PDF
        </button>
      </div>
      {busy && <Spinner text={busy} />}
      {error && <Notice tone="bad">{error}</Notice>}
      {done && (
        <Notice tone="ok">
          {done} Open it in Microsoft Word, WPS Office, LibreOffice or Google Docs.
          {pdf.scanned.length > 0 && scans === 'ocr' ? ' Check names and numbers in OCR text before using them.' : ''}
        </Notice>
      )}
      <p className="mt-4 text-[0.8rem] text-ink-3">Converted on your device. The PDF is not uploaded.</p>
    </Bench>
  );
}
