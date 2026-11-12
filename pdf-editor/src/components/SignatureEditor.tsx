import { useEffect, useRef, useState } from 'react';
import { Eraser, Upload, X } from 'lucide-react';
import { insertImageFile, placeAsset } from '../hooks/usePdfDocument';
import { getState, useEditorStore } from '../store/documentStore';
import { canvasToTrimmedAsset } from '../utils/imageUtils';

const INKS = ['#111827', '#1d4ed8', '#0f766e'];
const W = 560;
const H = 220;
const SCALE = 3; // the pad is drawn at 3x so the signature stays sharp when printed

/** Dialog to draw a signature with mouse, pen or finger, or to upload a picture of one. */
export function SignatureEditor() {
  const open = useEditorStore((s) => s.signatureOpen);
  const page = useEditorStore((s) => s.currentPage);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [ink, setInk] = useState(INKS[0]);
  const [width, setWidth] = useState(2.5);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    if (open) setEmpty(true);
  }, [open]);

  if (!open) return null;
  const close = () => getState().setSignatureOpen(false);

  const point = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W * SCALE, y: ((e.clientY - r.top) / r.height) * H * SCALE };
  };
  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }, pressure: number) => {
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.strokeStyle = ink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = width * SCALE * (pressure > 0 && pressure !== 0.5 ? 0.6 + pressure * 0.8 : 1);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };

  const insert = async () => {
    const asset = await canvasToTrimmedAsset(canvasRef.current!, 'signature.png');
    if (!asset) return;
    placeAsset(asset.id, asset.width / SCALE, asset.height / SCALE, page, undefined, true, asset);
    close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Add signature" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="w-full max-w-[620px] rounded-2xl bg-white p-5 shadow-float">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Add signature</h2>
          <button type="button" aria-label="Close" onClick={close} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <p className="mb-2 text-xs text-slate-500">Sign in the box with your mouse, pen or finger. It will be placed on page {page + 1}, where you can move, resize and rotate it.</p>
        <div className="relative overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
          <canvas
            ref={canvasRef}
            width={W * SCALE}
            height={H * SCALE}
            className="block w-full cursor-crosshair"
            style={{ aspectRatio: `${W} / ${H}`, touchAction: 'none' }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drawing.current = true;
              last.current = point(e);
              stroke(last.current, { x: last.current.x + 0.1, y: last.current.y }, e.pressure);
              setEmpty(false);
            }}
            onPointerMove={(e) => {
              if (!drawing.current || !last.current) return;
              const p = point(e);
              stroke(last.current, p, e.pressure);
              last.current = p;
            }}
            onPointerUp={() => (drawing.current = false)}
            onPointerCancel={() => (drawing.current = false)}
          />
          <div className="pointer-events-none absolute bottom-10 left-8 right-8 border-b border-slate-300" />
          {empty && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">Sign here</div>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5" role="group" aria-label="Ink color">
            {INKS.map((c) => (
              <button key={c} type="button" aria-label={`Ink ${c}`} aria-pressed={ink === c} onClick={() => setInk(c)} className={`h-6 w-6 rounded-full ring-offset-2 ${ink === c ? 'ring-2 ring-brand-500' : ''}`} style={{ background: c }} />
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Thickness
            <input type="range" min={1} max={6} step={0.5} value={width} onChange={(e) => setWidth(parseFloat(e.target.value))} />
          </label>
          <button type="button" onClick={clear} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
            <Eraser size={14} /> Clear
          </button>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Upload size={15} /> Upload image
            </button>
            <button type="button" disabled={empty} onClick={insert} className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40">
              Insert signature
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            insertImageFile(f, page, undefined, true);
            close();
          }}
        />
      </div>
    </div>
  );
}
