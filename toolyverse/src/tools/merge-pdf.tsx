'use client';

import { useRef, useState } from 'react';
import { imagesToPdf, looksEncrypted, mergePdfs } from '@editor/engines/PdfTools';
import { toPdfPicture } from '@/lib/image';
import { Bench, FileDrop, Notice, Spinner, download, formatSize, sizeProblem, type ToolProps } from './kit';
import { FileOrder } from './FileOrder';

const isImage = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(f.name);

export default function MergePdf(props: ToolProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const more = useRef<HTMLInputElement>(null);

  const add = (list: File[]) => {
    const ok = list.filter((f) => !sizeProblem(f, props));
    setError(list.length !== ok.length ? sizeProblem(list.find((f) => sizeProblem(f, props))!, props) : null);
    setFiles((cur) => [...cur, ...ok]);
    setDone(null);
  };

  const merge = async () => {
    setError(null);
    setDone(null);
    try {
      const parts: Uint8Array[] = [];
      for (const [i, f] of files.entries()) {
        setBusy(`Reading ${i + 1} of ${files.length}: ${f.name}`);
        if (isImage(f)) {
          parts.push(await imagesToPdf([await toPdfPicture(f)]));
          continue;
        }
        const bytes = new Uint8Array(await f.arrayBuffer());
        if (looksEncrypted(bytes)) throw new Error(`"${f.name}" is password-protected. Open it in the PDF Editor to remove the password, then merge.`);
        parts.push(bytes);
      }
      setBusy('Joining…');
      const { bytes, counts } = await mergePdfs(parts);
      download(bytes, 'merged.pdf', 'application/pdf');
      const pages = counts.reduce((a, b) => a + b, 0);
      setDone(`Merged ${files.length} files into ${pages} pages (${formatSize(bytes.length)}).`);
    } catch (e) {
      setError(/Failed to parse|Invalid PDF|No PDF header/i.test((e as Error).message) ? 'One of the files is not a readable PDF.' : (e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (!files.length)
    return <FileDrop accept="application/pdf,.pdf,image/jpeg,image/png,image/webp" multiple onFiles={add} props={props} label="Choose PDF files" hint="pictures work too" />;

  return (
    <Bench>
      <FileOrder files={files} onChange={setFiles} />
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={files.length < 2 || !!busy} onClick={merge}>
          Merge {files.length} files
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
          accept="application/pdf,.pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>
      {files.length < 2 && <p className="mt-3 text-[0.88rem] text-ink-3">Add at least one more file to merge.</p>}
      {busy && <Spinner text={busy} />}
      {error && <Notice tone="bad">{error}</Notice>}
      {done && <Notice tone="ok">{done}</Notice>}
    </Bench>
  );
}
