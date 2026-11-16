'use client';

import { useRef, useState } from 'react';
import { imagesToPdf } from '@/lib/pdf/PdfTools';
import { toPdfPicture } from '@/lib/image';
import { Bench, FileDrop, Notice, Spinner, download, formatSize, sizeProblem, type ToolProps } from './kit';
import { FileOrder } from './FileOrder';

export default function JpgToPdf(props: ToolProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const more = useRef<HTMLInputElement>(null);

  const add = (list: File[]) => {
    const bad = list.find((f) => sizeProblem(f, props));
    setError(bad ? sizeProblem(bad, props) : null);
    setFiles((cur) => [...cur, ...list.filter((f) => !sizeProblem(f, props))]);
    setDone(null);
  };

  const run = async () => {
    setError(null);
    try {
      const pics = [];
      for (const [i, f] of files.entries()) {
        setBusy(`Reading picture ${i + 1} of ${files.length}…`);
        pics.push(await toPdfPicture(f));
      }
      setBusy('Building the PDF…');
      const bytes = await imagesToPdf(pics);
      download(bytes, files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '.pdf') : 'images.pdf', 'application/pdf');
      setDone(`Made a ${files.length}-page PDF (${formatSize(bytes.length)}).`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (!files.length) return <FileDrop accept="image/jpeg,image/png,image/webp" multiple onFiles={add} props={props} label="Choose images" hint="JPG, PNG or WebP" />;

  return (
    <Bench>
      <FileOrder files={files} onChange={setFiles} />
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={!!busy} onClick={run}>
          Create PDF
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => more.current?.click()}>
          + Add more
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => (setFiles([]), setDone(null))}>
          Start over
        </button>
        <input
          ref={more}
          type="file"
          hidden
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>
      {busy && <Spinner text={busy} />}
      {error && <Notice tone="bad">{error}</Notice>}
      {done && <Notice tone="ok">{done}</Notice>}
    </Bench>
  );
}
