'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readContent, type QrContent, type QrKind } from '@/lib/qr/read';
import { Bench, Notice, sizeProblem, useCopy, type ToolProps } from './kit';
import { Drop } from './gst/ReturnUI';

interface Found {
  id: number;
  /** Where it was read from: a file name, "Pasted picture" or "Camera". */
  source: string;
  text: string;
  content: QrContent;
}

type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

/** The browser's own barcode reader (Chrome, Edge, Android, newer Safari), when it reads QR codes. */
function nativeDetector(): Detector | null {
  const D = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!D) return null;
  try {
    return new D({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

/**
 * Every QR code in a picture. The browser's reader finds several at once; otherwise jsQR reads
 * the picture at a few sizes and, after each code it finds, paints it over and looks again.
 */
async function codesIn(src: CanvasImageSource, W: number, H: number, quick = false): Promise<string[]> {
  const found = new Set<string>();
  const native = nativeDetector();
  if (native) {
    try {
      for (const c of await native.detect(src)) if (c.rawValue) found.add(c.rawValue);
    } catch {
      /* not for this picture: jsQR below */
    }
    if (found.size) return [...found];
  }
  const { default: jsQR } = await import('jsqr');
  for (const max of quick ? [720] : [1200, 800, 1800, 500]) {
    const k = Math.min(1, max / Math.max(W, H));
    const w = Math.max(1, Math.round(W * k));
    const h = Math.max(1, Math.round(H * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);
    for (let n = 0; n < (quick ? 1 : 8); n++) {
      const hit = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: quick ? 'dontInvert' : 'attemptBoth' });
      if (!hit) break;
      found.add(hit.data);
      const L = hit.location;
      const pts = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner];
      const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
      const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(cx + (p.x - cx) * 1.3, cy + (p.y - cy) * 1.3) : ctx.moveTo(cx + (p.x - cx) * 1.3, cy + (p.y - cy) * 1.3)));
      ctx.closePath();
      ctx.fill();
    }
    if (found.size) break;
  }
  return [...found];
}

function loadPicture(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    img.src = url;
  });
}

const ACTION: Partial<Record<QrKind, string>> = {
  url: 'Open the link',
  whatsapp: 'Open in WhatsApp',
  upi: 'Pay with a UPI app',
  email: 'Write the email',
  phone: 'Call',
  sms: 'Send the text',
  location: 'Open in Google Maps',
};

export default function QrCodeScanner(props: ToolProps) {
  const [found, setFound] = useState<Found[]>([]);
  const [misses, setMisses] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [camera, setCamera] = useState<'off' | 'starting' | 'on'>('off');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const seq = useRef(0);

  const add = useCallback((source: string, texts: string[]) => {
    setFound((cur) => [...texts.map((text) => ({ id: ++seq.current, source, text, content: readContent(text) })), ...cur]);
  }, []);

  const read = useCallback(
    async (files: File[], pasted = false) => {
      setError(null);
      const missed: string[] = [];
      for (const f of files) {
        const name = pasted ? 'Pasted picture' : f.name;
        const p = sizeProblem(f, props);
        if (p) {
          setError(p);
          continue;
        }
        setBusy(`Reading ${name}…`);
        try {
          const img = await loadPicture(f);
          const codes = await codesIn(img, img.naturalWidth, img.naturalHeight);
          if (codes.length) add(name, codes);
          else missed.push(name);
        } catch {
          setError(`${name} could not be opened as a picture. Use PNG, JPG or WebP; an iPhone HEIC photo can be shared as JPG, or take a screenshot of it.`);
        }
      }
      setBusy(null);
      setMisses(missed);
    },
    [add, props],
  );

  // A screenshot pasted straight from the clipboard (Ctrl+V / Cmd+V).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      void read(files, true);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [read]);

  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera('off');
  }, []);

  const startCamera = async () => {
    setError(null);
    setMisses([]);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot use the camera on this page. Use your phone’s camera app, or upload a picture or screenshot of the code.');
      return;
    }
    setCamera('starting');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      setCamera('on');
    } catch (e) {
      setCamera('off');
      const name = (e as { name?: string }).name;
      setError(
        name === 'NotAllowedError'
          ? 'Camera access was refused. Allow the camera for this site in your browser’s settings, or upload a picture of the code instead.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device. Upload a picture or screenshot of the code instead.'
            : 'The camera could not start. Another app may be using it; close it and try again, or upload a picture instead.',
      );
    }
  };

  // While the camera is on: read a frame every fifth of a second until a code turns up.
  useEffect(() => {
    if (camera !== 'on') return;
    const v = video.current;
    if (!v || !stream.current) return;
    v.srcObject = stream.current;
    void v.play().catch(() => undefined);
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (!alive) return;
      if (v.readyState >= 2 && v.videoWidth) {
        const codes = await codesIn(v, v.videoWidth, v.videoHeight, true).catch(() => []);
        if (!alive) return;
        if (codes.length) {
          add('Camera', codes);
          stopCamera();
          return;
        }
      }
      timer = setTimeout(() => void tick(), 200);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [camera, add, stopCamera]);
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  return (
    <Bench>
      <Drop
        accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg"
        title="Drop a picture of a QR code"
        hint="A photo, a screenshot or a saved image: several codes in one picture are all read. Or paste a screenshot with Ctrl+V. Nothing is uploaded."
        onFiles={(files) => void read(files)}
        extra={
          camera === 'off' ? (
            <button type="button" className="btn btn-ghost" onClick={() => void startCamera()}>
              Use the camera
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={stopCamera}>
              Stop the camera
            </button>
          )
        }
      />

      {camera !== 'off' && (
        <div className="mt-4">
          <div className="relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden border border-ink bg-ink">
            <video ref={video} className="h-full w-full object-cover" playsInline muted aria-label="Camera view" />
            <span className="pointer-events-none absolute inset-[14%] border-2 border-paper/80" aria-hidden="true" />
          </div>
          <p className="label mt-2 text-center" role="status">
            {camera === 'starting' ? 'Starting the camera…' : 'Point the camera at the QR code and hold it steady'}
          </p>
        </div>
      )}

      {busy && (
        <p className="label mt-3" role="status">
          {busy}
        </p>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      {misses.length > 0 && (
        <Notice tone="warn">
          No QR code found in {misses.join(', ')}. Crop closer to the code, make sure it is sharp and not cut off at the edges, and for a code shown on a screen use a screenshot rather than a photo of the screen.
        </Notice>
      )}

      {found.length > 0 && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="label">
              {found.length} {found.length === 1 ? 'code' : 'codes'} read
            </p>
            <button type="button" className="text-[0.88rem] text-ink-3 underline" onClick={() => setFound([])}>
              Clear
            </button>
          </div>
          <ul className="mt-2 space-y-4">
            {found.map((f) => (
              <Result key={f.id} f={f} />
            ))}
          </ul>
        </div>
      )}
    </Bench>
  );
}

function Result({ f }: { f: Found }) {
  const { copied, copy } = useCopy();
  const c = f.content;
  return (
    <li className="border border-rule bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="display text-[1.15rem]">{c.title}</p>
        <span className="text-[0.8rem] text-ink-3">{f.source}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[minmax(7rem,max-content)_1fr] gap-x-4 gap-y-1 text-[0.92rem]">
        {c.fields.map(([k, v], i) => (
          <div key={i} className="contents">
            <dt className="text-ink-3">{k}</dt>
            <dd className="break-all font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {c.warn.map((w) => (
        <Notice key={w} tone="warn">
          {w}
        </Notice>
      ))}
      <div className="mt-3 flex flex-wrap gap-2">
        {c.href && ACTION[c.kind] && (
          <a className="btn" href={c.href} target="_blank" rel="noopener noreferrer nofollow">
            {ACTION[c.kind]}
          </a>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => void copy(f.text, 'all')}>
          {copied === 'all' ? 'Copied' : 'Copy the text'}
        </button>
        {c.kind === 'wifi' && c.fields[1] && !/^None/.test(c.fields[1][1]) && (
          <button type="button" className="btn btn-ghost" onClick={() => void copy(c.fields[1][1], 'pass')}>
            {copied === 'pass' ? 'Copied' : 'Copy the password'}
          </button>
        )}
      </div>
      {c.kind === 'upi' && <p className="mt-2 text-[0.8rem] text-ink-3">“Pay with a UPI app” works on a phone with GPay, PhonePe, Paytm or BHIM installed.</p>}
      <details className="mt-3 text-[0.85rem]">
        <summary className="cursor-pointer text-ink-3">Exactly what the code holds</summary>
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all border border-rule bg-paper-2 p-2 font-mono text-[0.8rem]">{f.text}</pre>
      </details>
      <p className="mt-2 text-[0.8rem] text-ink-3">
        Need one like it? <Link href="/qr-code-generator">Make a QR code</Link>.
      </p>
    </li>
  );
}
