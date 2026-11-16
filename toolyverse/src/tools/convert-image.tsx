'use client';

import { useState } from 'react';
import { zipStore } from '@editor/engines/PdfTools';
import { EXT, drawCanvas, encode, loadBitmap, needsBackground, type OutType } from '@/lib/image';
import { Bench, Field, FileDrop, Notice, Segmented, Spinner, baseName, download, formatSize, type ToolProps } from './kit';

export default function ConvertImage(props: ToolProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [type, setType] = useState<OutType>('image/jpeg');
  const [quality, setQuality] = useState(90);
  const [bg, setBg] = useState('#ffffff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const out: { name: string; bytes: Uint8Array }[] = [];
      const used = new Set<string>();
      for (const f of files) {
        const bitmap = await loadBitmap(f);
        const blob = await encode(drawCanvas(bitmap, bitmap.width, bitmap.height, needsBackground(type) ? bg : undefined), type, quality / 100);
        bitmap.close();
        let name = `${baseName(f.name)}.${EXT[type]}`;
        for (let i = 2; used.has(name); i++) name = `${baseName(f.name)}-${i}.${EXT[type]}`;
        used.add(name);
        out.push({ name, bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
      if (out.length === 1) download(out[0].bytes, out[0].name, type);
      else download(zipStore(out), `converted-${EXT[type]}.zip`, 'application/zip');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!files.length)
    return <FileDrop accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif" multiple onFiles={setFiles} props={props} label="Choose images" hint="JPG, PNG, WebP, GIF, BMP, AVIF" />;

  return (
    <Bench>
      <ul className="border-t border-ink">
        {files.map((f, i) => (
          <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 border-b border-rule py-2 text-[0.93rem]">
            <span className="truncate">{f.name}</span>
            <span className="flex items-center gap-3">
              <span className="font-mono text-ink-3">{formatSize(f.size)}</span>
              <button type="button" className="text-ink-3 hover:text-bad" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap items-end gap-6">
        <Field label="Convert to">
          <Segmented label="Format" value={type} onChange={setType} options={[{ value: 'image/jpeg', label: 'JPG' }, { value: 'image/png', label: 'PNG' }, { value: 'image/webp', label: 'WebP' }]} />
        </Field>
        {type !== 'image/png' && (
          <Field label={`Quality: ${quality}%`}>
            <input type="range" min={40} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-48 accent-[var(--signal)]" />
          </Field>
        )}
        {type === 'image/jpeg' && (
          <Field label="Background for transparent areas">
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-11 w-16 cursor-pointer border border-rule-2 bg-card" />
          </Field>
        )}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={run} disabled={busy}>
          Convert {files.length > 1 ? `${files.length} images` : ''}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setFiles([])}>
          Start over
        </button>
      </div>
      {busy && <Spinner text="Converting…" />}
      {error && <Notice tone="bad">{error}</Notice>}
    </Bench>
  );
}
