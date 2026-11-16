'use client';

import { useState } from 'react';
import { zipStore } from '@editor/engines/PdfTools';
import { openPdf, renderPage } from '@/lib/pdf/render';
import { encode } from '@/lib/image';
import { Bench, FileDrop, Notice, Segmented, Spinner, baseName, download, type ToolProps } from './kit';
import { usePdfFile } from './usePdfFile';

export default function PdfToJpg(props: ToolProps) {
  const pdf = usePdfFile();
  const [format, setFormat] = useState<'image/jpeg' | 'image/png'>('image/jpeg');
  const [dpi, setDpi] = useState<'96' | '150' | '300'>('150');
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState<string | null>(null);

  if (!pdf.file || !pdf.bytes)
    return (
      <>
        <FileDrop accept="application/pdf,.pdf" onFiles={(f) => (setDone(null), pdf.open(f[0]))} props={props} label="Choose a PDF" />
        {pdf.error && <Notice tone="bad">{pdf.error}</Notice>}
      </>
    );

  const run = async () => {
    setDone(null);
    try {
      const doc = await openPdf(pdf.bytes!);
      const ext = format === 'image/png' ? 'png' : 'jpg';
      const digits = String(doc.numPages).length;
      const files: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < doc.numPages; i++) {
        setBusy(`Drawing page ${i + 1} of ${doc.numPages}…`);
        const canvas = await renderPage(doc, i, Number(dpi) / 72);
        const blob = await encode(canvas, format, 0.9);
        canvas.width = 0;
        files.push({ name: `${baseName(pdf.file!.name)}-page-${String(i + 1).padStart(digits, '0')}.${ext}`, bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
      await doc.destroy();
      if (files.length === 1) download(files[0].bytes, files[0].name, format);
      else download(zipStore(files), `${baseName(pdf.file!.name)}-images.zip`, 'application/zip');
      setDone(files.length === 1 ? 'Saved the page as an image.' : `Saved ${files.length} images in one ZIP file.`);
    } catch (e) {
      pdf.setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <Bench>
      <p className="label">
        {pdf.file.name} · {pdf.pages} pages
      </p>
      <div className="mt-4 flex flex-wrap gap-4">
        <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: 'image/jpeg', label: 'JPG' }, { value: 'image/png', label: 'PNG' }]} />
        <Segmented
          label="Resolution"
          value={dpi}
          onChange={setDpi}
          options={[
            { value: '96', label: '96 dpi · small' },
            { value: '150', label: '150 dpi · screen' },
            { value: '300', label: '300 dpi · print' },
          ]}
        />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={!!busy} onClick={run}>
          Convert {pdf.pages} page{pdf.pages > 1 ? 's' : ''}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => (pdf.reset(), setDone(null))}>
          Another PDF
        </button>
      </div>
      {busy && <Spinner text={busy} />}
      {pdf.error && <Notice tone="bad">{pdf.error}</Notice>}
      {done && <Notice tone="ok">{done}</Notice>}
    </Bench>
  );
}
