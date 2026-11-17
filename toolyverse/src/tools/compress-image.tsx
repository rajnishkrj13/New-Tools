'use client';

import { useEffect, useState } from 'react';
import { EXT, drawCanvas, encode, loadBitmap, squeeze, type OutType } from '@/lib/image';
import { Bench, Field, FileDrop, Notice, Segmented, Spinner, baseName, download, formatSize, type ToolProps } from './kit';
import { BlobImage } from './Preview';

type Mode = 'target' | 'quality';

export default function CompressImage(props: ToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('target');
  const [kb, setKb] = useState(() => (Number(props.preset?.kb) > 0 ? String(Number(props.preset?.kb)) : '50'));
  const [quality, setQuality] = useState(70);
  const [format, setFormat] = useState<Exclude<OutType, 'image/png'>>('image/jpeg');
  const [shrink, setShrink] = useState(true);
  const [result, setResult] = useState<{ blob: Blob; width: number; height: number; reached: boolean; quality: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const bitmap = await loadBitmap(file);
        let r;
        if (mode === 'target') {
          const target = Number(kb) * 1024;
          if (!(target > 0)) throw new Error('Enter a target size in KB.');
          r = await squeeze(bitmap, format, target, shrink);
        } else {
          const canvas = drawCanvas(bitmap, bitmap.width, bitmap.height, format === 'image/jpeg' ? '#ffffff' : undefined);
          r = { blob: await encode(canvas, format, quality / 100), width: canvas.width, height: canvas.height, reached: true, quality: quality / 100 };
        }
        bitmap.close();
        if (!cancelled) setResult(r);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [file, mode, kb, quality, format, shrink]);

  if (!file) return <FileDrop accept="image/jpeg,image/png,image/webp" onFiles={(f) => setFile(f[0])} props={props} label="Choose an image" hint="JPG, PNG or WebP" />;

  const saved = result ? 1 - result.blob.size / file.size : 0;
  return (
    <Bench>
      <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Segmented label="How to compress" value={mode} onChange={setMode} options={[{ value: 'target', label: 'To a size' }, { value: 'quality', label: 'By quality' }]} />
          {mode === 'target' ? (
            <>
              <Field label="Target size (KB)">
                <div className="flex flex-wrap gap-2">
                  <input className="field !w-28" inputMode="numeric" value={kb} onChange={(e) => setKb(e.target.value.replace(/[^\d.]/g, ''))} />
                  {['20', '50', '100', '200', '500'].map((v) => (
                    <button key={v} type="button" onClick={() => setKb(v)} className={`btn btn-ghost !min-h-11 !px-3 ${kb === v ? '!border-ink' : ''}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </Field>
              <label className="flex items-center gap-2 text-[0.92rem]">
                <input type="checkbox" checked={shrink} onChange={(e) => setShrink(e.target.checked)} /> Also reduce dimensions if needed
              </label>
            </>
          ) : (
            <Field label={`Quality: ${quality}%`}>
              <input type="range" min={10} max={95} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full accent-[var(--signal)]" />
            </Field>
          )}
          <Field label="Save as">
            <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: 'image/jpeg', label: 'JPG' }, { value: 'image/webp', label: 'WebP' }]} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={!result || busy} onClick={() => result && download(result.blob, `${baseName(file.name)}-compressed.${EXT[format]}`)}>
              Download
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => (setFile(null), setResult(null))}>
              Another image
            </button>
          </div>
        </div>
        <div>
          <dl className="grid grid-cols-3 border-l border-t border-ink font-mono text-[0.9rem]">
            {[
              ['Before', formatSize(file.size)],
              ['After', result ? formatSize(result.blob.size) : '…'],
              ['Saved', result ? `${Math.max(0, Math.round(saved * 100))}%` : '…'],
            ].map(([k, v]) => (
              <div key={k} className="border-b border-r border-ink px-3 py-2">
                <dt className="label">{k}</dt>
                <dd className="text-[1.15rem] font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {busy && <Spinner text="Compressing…" />}
          {error && <Notice tone="bad">{error}</Notice>}
          {result && !result.reached && <Notice tone="warn">Could not get under {kb} KB at this size. Tick “Also reduce dimensions”, or choose a larger target.</Notice>}
          {result && (
            <p className="mt-3 text-[0.85rem] text-ink-3">
              {result.width} × {result.height} px · quality {Math.round(result.quality * 100)}%
            </p>
          )}
          <div className="mt-3 flex min-h-[200px] items-center justify-center bg-paper-2 p-3">
            <BlobImage blob={result?.blob ?? null} alt="Compressed result" className="max-h-[420px] max-w-full object-contain" />
          </div>
        </div>
      </div>
    </Bench>
  );
}
