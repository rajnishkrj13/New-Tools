'use client';

import { useState } from 'react';
import { COMPRESS_LEVELS, compressPdfImages } from '@/lib/pdf/PdfTools';
import { recodeJpeg } from '@/lib/image';
import { Bench, FileDrop, Notice, Segmented, Spinner, baseName, download, formatSize, type ToolProps } from './kit';
import { usePdfFile } from './usePdfFile';

export default function CompressPdf(props: ToolProps) {
  const pdf = usePdfFile();
  const [level, setLevel] = useState<'balanced' | 'small'>('balanced');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ bytes: Uint8Array; shrunk: number; candidates: number } | null>(null);

  if (!pdf.file || !pdf.bytes)
    return (
      <>
        <FileDrop accept="application/pdf,.pdf" onFiles={(f) => (setResult(null), pdf.open(f[0]))} props={props} label="Choose a PDF" />
        {pdf.error && <Notice tone="bad">{pdf.error}</Notice>}
      </>
    );

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await compressPdfImages(pdf.bytes!, COMPRESS_LEVELS[level], recodeJpeg));
    } catch (e) {
      pdf.setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const before = pdf.bytes.length;
  const smaller = result && result.bytes.length < before;
  return (
    <Bench>
      <p className="label">
        {pdf.file.name} · {pdf.pages} pages · {formatSize(before)}
      </p>
      <div className="mt-4">
        <Segmented
          label="Compression"
          value={level}
          onChange={(v) => (setLevel(v), setResult(null))}
          options={[
            { value: 'balanced', label: 'Balanced · screen quality' },
            { value: 'small', label: 'Strong · smallest for email' },
          ]}
        />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={busy} onClick={run}>
          Compress
        </button>
        {smaller && (
          <button type="button" className="btn" onClick={() => download(result!.bytes, `${baseName(pdf.file!.name)}-compressed.pdf`, 'application/pdf')}>
            Download {formatSize(result!.bytes.length)}
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => (pdf.reset(), setResult(null))}>
          Another PDF
        </button>
      </div>
      {busy && <Spinner text="Compressing the photos inside…" />}
      {pdf.error && <Notice tone="bad">{pdf.error}</Notice>}
      {result &&
        (smaller ? (
          <Notice tone="ok">
            {formatSize(before)} → {formatSize(result.bytes.length)}: {Math.round((1 - result.bytes.length / before) * 100)}% smaller ({result.shrunk} of {result.candidates} photos reduced).
          </Notice>
        ) : (
          <Notice tone="warn">
            {result.candidates ? 'The photos in this PDF are already small, so it could not be made smaller.' : 'This PDF has no photos to reduce; text and drawings are already compact.'}
          </Notice>
        ))}
    </Bench>
  );
}
