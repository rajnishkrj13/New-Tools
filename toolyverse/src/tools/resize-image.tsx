'use client';

import { useEffect, useState } from 'react';
import { EXT, drawCanvas, encode, loadBitmap, needsBackground, outTypeFor } from '@/lib/image';
import { Bench, Field, FileDrop, Notice, Segmented, baseName, download, formatSize, type ToolProps } from './kit';
import { BlobImage } from './Preview';

type Unit = 'px' | 'cm' | 'pct';

export default function ResizeImage(props: ToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [unit, setUnit] = useState<Unit>('px');
  const [w, setW] = useState('');
  const [h, setH] = useState('');
  const [dpi, setDpi] = useState('300');
  const [keep, setKeep] = useState(true);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    loadBitmap(file)
      .then((b) => {
        setSize({ w: b.width, h: b.height });
        setW(String(b.width));
        setH(String(b.height));
        b.close();
      })
      .catch((e) => setError(e.message));
  }, [file]);

  const ratio = size ? size.h / size.w : 1;
  const toPx = (v: number) => (unit === 'px' ? v : unit === 'cm' ? (v / 2.54) * Number(dpi || 300) : 0);
  const target = (() => {
    if (!size) return null;
    if (unit === 'pct') {
      const p = Number(w) / 100;
      return p > 0 ? { w: Math.round(size.w * p), h: Math.round(size.h * p) } : null;
    }
    const pw = Math.round(toPx(Number(w)));
    const ph = Math.round(toPx(Number(h)));
    return pw > 0 && ph > 0 ? { w: pw, h: ph } : null;
  })();
  const tooBig = target && target.w * target.h > 50e6;
  const shown = target && !tooBig ? result : null;

  useEffect(() => {
    if (!file || !target || tooBig) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const bitmap = await loadBitmap(file);
        const type = outTypeFor(file);
        const blob = await encode(drawCanvas(bitmap, target.w, target.h, needsBackground(type) ? '#ffffff' : undefined), type, 0.92);
        bitmap.close();
        if (!cancelled) setResult(blob);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [file, target?.w, target?.h]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!file) return <FileDrop accept="image/jpeg,image/png,image/webp" onFiles={(f) => setFile(f[0])} props={props} label="Choose an image" hint="JPG, PNG or WebP" />;

  const changeUnit = (u: Unit) => {
    if (!size) return;
    setUnit(u);
    const d = Number(dpi || 300);
    if (u === 'px') {
      setW(String(size.w));
      setH(String(size.h));
    } else if (u === 'cm') {
      setW(((size.w / d) * 2.54).toFixed(2));
      setH(((size.h / d) * 2.54).toFixed(2));
    } else {
      setW('50');
      setH('50');
    }
  };
  const fmt = (n: number) => (unit === 'px' ? String(Math.round(n)) : n.toFixed(2));

  return (
    <Bench>
      <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Segmented label="Unit" value={unit} onChange={changeUnit} options={[{ value: 'px', label: 'Pixels' }, { value: 'cm', label: 'cm' }, { value: 'pct', label: 'Percent' }]} />
          {unit === 'pct' ? (
            <Field label="Percent of original">
              <input className="field !w-28" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Width (${unit})`}>
                <input
                  className="field"
                  inputMode="decimal"
                  value={w}
                  onChange={(e) => {
                    setW(e.target.value);
                    if (keep && Number(e.target.value) > 0) setH(fmt(Number(e.target.value) * ratio));
                  }}
                />
              </Field>
              <Field label={`Height (${unit})`}>
                <input
                  className="field"
                  inputMode="decimal"
                  value={h}
                  onChange={(e) => {
                    setH(e.target.value);
                    if (keep && Number(e.target.value) > 0) setW(fmt(Number(e.target.value) / ratio));
                  }}
                />
              </Field>
            </div>
          )}
          {unit === 'cm' && (
            <Field label="Print resolution (DPI)" hint="300 for photo prints and most forms">
              <input className="field !w-28" inputMode="numeric" value={dpi} onChange={(e) => setDpi(e.target.value.replace(/\D/g, ''))} />
            </Field>
          )}
          {unit !== 'pct' && (
            <label className="flex items-center gap-2 text-[0.92rem]">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep proportions
            </label>
          )}
          {unit === 'cm' && (
            <div className="flex flex-wrap gap-2">
              {[
                ['3.5 × 4.5 cm (passport)', '3.5', '4.5'],
                ['2 × 2 in (US visa)', '5.08', '5.08'],
              ].map(([label, a, b]) => (
                <button key={label} type="button" className="btn btn-ghost !min-h-9 !px-3 text-sm" onClick={() => (setKeep(false), setW(a), setH(b))}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={!shown} onClick={() => shown && download(shown, `${baseName(file.name)}-${target?.w}x${target?.h}.${EXT[outTypeFor(file)]}`)}>
              Download
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => (setFile(null), setResult(null), setSize(null))}>
              Another image
            </button>
          </div>
        </div>
        <div>
          <p className="font-mono text-[0.9rem]">
            {size ? `${size.w} × ${size.h} px` : '…'} → {target ? `${target.w} × ${target.h} px` : '—'} {shown ? `· ${formatSize(shown.size)}` : ''}
          </p>
          {tooBig && <Notice tone="bad">That is more than 50 megapixels; choose a smaller size.</Notice>}
          {error && <Notice tone="bad">{error}</Notice>}
          <div className="mt-3 flex min-h-[200px] items-center justify-center bg-paper-2 p-3">
            <BlobImage blob={shown} alt="Resized result" className="max-h-[420px] max-w-full object-contain" />
          </div>
        </div>
      </div>
    </Bench>
  );
}
