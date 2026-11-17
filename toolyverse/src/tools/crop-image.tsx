'use client';

import { useEffect, useRef, useState } from 'react';
import { EXT, drawCanvas, encode, loadBitmap, needsBackground, outTypeFor } from '@/lib/image';
import { Bench, FileDrop, Notice, baseName, download, type ToolProps } from './kit';

type Rect = { x: number; y: number; w: number; h: number };
const RATIOS: { label: string; r: number | null }[] = [
  { label: 'Free', r: null },
  { label: '1:1', r: 1 },
  { label: '4:3', r: 4 / 3 },
  { label: '3:4', r: 3 / 4 },
  { label: '16:9', r: 16 / 9 },
  { label: 'Passport 35×45', r: 35 / 45 },
];

export default function CropImage(props: ToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<ImageBitmap | HTMLCanvasElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  // Pages made for one job can start locked to a ratio (the passport photo page: 35 × 45 mm).
  const [ratio, setRatio] = useState<number | null>(() => RATIOS.find((r) => r.label.toLowerCase().startsWith(props.preset?.ratio ?? '-'))?.r ?? null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: string; sx: number; sy: number; start: Rect } | null>(null);

  const dims = img ? { w: img.width, h: img.height } : { w: 1, h: 1 };

  const show = async (src: ImageBitmap | HTMLCanvasElement) => {
    setImg(src);
    const c = src instanceof HTMLCanvasElement ? src : drawCanvas(src, src.width, src.height);
    const blob = await encode(c, 'image/png');
    setUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(blob);
    });
    const inset = 0.1;
    let w = src.width * (1 - 2 * inset);
    let h = src.height * (1 - 2 * inset);
    // With a ratio chosen, the frame starts as the largest centred area of that shape.
    if (ratio) {
      if (w / h > ratio) w = h * ratio;
      else h = w / ratio;
    }
    setRect({ x: (src.width - w) / 2, y: (src.height - h) / 2, w, h });
  };

  // Load only when another photo is chosen, framing it with the ratio chosen at that moment;
  // changing the ratio later reshapes the frame instead (applyRatio), without reloading.
  useEffect(() => {
    if (!file) return;
    loadBitmap(file)
      .then(show)
      .catch((e) => setError(e.message));
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  const fit = (r: Rect, keepRatio: number | null): Rect => {
    let { x, y, w, h } = r;
    w = Math.max(8, Math.min(w, dims.w));
    h = Math.max(8, Math.min(h, dims.h));
    if (keepRatio) {
      if (w / h > keepRatio) w = h * keepRatio;
      else h = w / keepRatio;
    }
    x = Math.min(Math.max(0, x), dims.w - w);
    y = Math.min(Math.max(0, y), dims.h - h);
    return { x, y, w, h };
  };

  const applyRatio = (r: number | null) => {
    setRatio(r);
    if (r) setRect((cur) => fit({ ...cur, w: Math.max(cur.w, cur.h * r), h: Math.max(cur.h, cur.w / r) }, r));
  };

  // Which part is dragged comes from data-mode: move, or a corner (nw, ne, sw, se).
  const onDown = (e: React.PointerEvent<HTMLElement>) => {
    const mode = e.currentTarget.dataset.mode ?? 'move';
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: rect };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const k = box.current ? dims.w / box.current.getBoundingClientRect().width : 1;
    const dx = (e.clientX - d.sx) * k;
    const dy = (e.clientY - d.sy) * k;
    const s = d.start;
    if (d.mode === 'move') return setRect(fit({ ...s, x: s.x + dx, y: s.y + dy }, null));
    let { x, y, w, h } = s;
    if (d.mode.includes('e')) w = s.w + dx;
    if (d.mode.includes('s')) h = s.h + dy;
    if (d.mode.includes('w')) {
      x = s.x + dx;
      w = s.w - dx;
    }
    if (d.mode.includes('n')) {
      y = s.y + dy;
      h = s.h - dy;
    }
    if (ratio) {
      // Corner drags follow the width; the height obeys the ratio, anchored at the far edge.
      const nh = w / ratio;
      if (d.mode.includes('n')) y = s.y + s.h - nh;
      h = nh;
    }
    setRect(fit({ x, y, w, h }, ratio));
  };
  const onUp = () => (drag.current = null);

  const rotate = async () => {
    if (!img) return;
    const c = document.createElement('canvas');
    c.width = img.height;
    c.height = img.width;
    const ctx = c.getContext('2d')!;
    ctx.translate(c.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, 0);
    await show(c);
  };

  const save = async () => {
    if (!img || !file) return;
    const type = outTypeFor(file);
    const r = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
    const blob = await encode(drawCanvas(img, r.w, r.h, needsBackground(type) ? '#ffffff' : undefined, r), type, 0.95);
    download(blob, `${baseName(file.name)}-cropped.${EXT[type]}`);
  };

  if (!file) return <FileDrop accept="image/jpeg,image/png,image/webp" onFiles={(f) => setFile(f[0])} props={props} label="Choose an image" hint="JPG, PNG or WebP" />;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <Bench>
      <div className="flex flex-wrap items-center gap-2">
        {RATIOS.map((r) => (
          <button key={r.label} type="button" onClick={() => applyRatio(r.r)} className={`btn btn-ghost !min-h-9 !px-3 text-sm ${ratio === r.r ? '!border-ink !bg-paper-2' : ''}`}>
            {r.label}
          </button>
        ))}
        <button type="button" className="btn btn-ghost !min-h-9 !px-3 text-sm" onClick={rotate}>
          Rotate 90°
        </button>
        <span className="label ml-auto">
          {Math.round(rect.w)} × {Math.round(rect.h)} px
        </span>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="mt-4 flex justify-center bg-paper-2 p-3">
        {url && (
          <div ref={box} className="relative inline-block touch-none select-none" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Image being cropped" className="block max-h-[520px] max-w-full" draggable={false} />
            <div
              className="absolute cursor-move border-2 border-white outline outline-1 outline-black"
              style={{ left: pct(rect.x, dims.w), top: pct(rect.y, dims.h), width: pct(rect.w, dims.w), height: pct(rect.h, dims.h), boxShadow: '0 0 0 9999px rgba(20,18,15,0.55)' }}
              data-mode="move"
              onPointerDown={onDown}
            >
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} className="border border-white/30" />
                ))}
              </div>
              {['nw', 'ne', 'sw', 'se'].map((c) => (
                <span
                  key={c}
                  role="presentation"
                  data-mode={c}
                  onPointerDown={onDown}
                  className="absolute h-4 w-4 border-2 border-black bg-white"
                  style={{ [c.includes('n') ? 'top' : 'bottom']: -8, [c.includes('w') ? 'left' : 'right']: -8, cursor: `${c}-resize` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={save} disabled={!img}>
          Download cropped image
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => (setFile(null), setImg(null))}>
          Another image
        </button>
      </div>
    </Bench>
  );
}
