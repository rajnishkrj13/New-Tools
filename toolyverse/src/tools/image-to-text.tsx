'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isOcrLang, OCR_LANGS, prepareImage, recognize, stopOcr, type OcrLang, type OcrResult } from '@/lib/ocr';
import { Bench, FileDrop, Notice, Segmented, baseName, download, sizeProblem, useCopy, type ToolProps } from './kit';

interface Item {
  id: number;
  file: File;
  url: string;
  status: 'waiting' | 'reading' | 'done' | 'error';
  progress: number;
  result?: OcrResult;
  error?: string;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/bmp,image/gif,image/tiff,.jpg,.jpeg,.png,.webp,.bmp,.gif';
/** Words read with less certainty than this are outlined on the picture to be checked. */
const UNSURE = 70;

const quality = (c: number) => (c >= 85 ? { tone: 'ok' as const, label: 'Clear' } : c >= 65 ? { tone: 'warn' as const, label: 'Check' } : { tone: 'bad' as const, label: 'Low' });

export default function ImageToText(props: ToolProps) {
  const batch = props.features.batch !== false;
  const [items, setItems] = useState<Item[]>([]);
  const [lang, setLang] = useState<OcrLang>(isOcrLang(props.preset?.lang) ? props.preset.lang : 'eng');
  const [enhance, setEnhance] = useState(true);
  const [showBoxes, setShowBoxes] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loadingEngine, setLoadingEngine] = useState(false);
  const seq = useRef(0);
  const running = useRef(false);
  // The queue reads the current settings when each image starts, not the ones it was created with.
  const settings = useRef({ lang, enhance });
  useEffect(() => {
    settings.current = { lang, enhance };
  }, [lang, enhance]);
  const { copied, copy } = useCopy();

  const update = (id: number, patch: Partial<Item>) => setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  /** Reads waiting images one at a time, in the order they were added. */
  const runQueue = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const next = await new Promise<Item | undefined>((res) => setItems((cur) => (res(cur.find((it) => it.status === 'waiting')), cur)));
        if (!next) break;
        update(next.id, { status: 'reading', progress: 0, error: undefined });
        try {
          const canvas = await prepareImage(next.file, settings.current.enhance);
          setLoadingEngine(true);
          const result = await recognize(canvas, settings.current.lang, (p) => {
            setLoadingEngine(false);
            update(next.id, { progress: p });
          });
          canvas.width = 0;
          update(next.id, { status: 'done', progress: 1, result });
        } catch (e) {
          const msg = (e as Error)?.message || String(e);
          update(next.id, { status: 'error', error: /fetch|network|load/i.test(msg) ? 'The text reader could not be loaded. Check your connection and try again.' : msg });
        } finally {
          setLoadingEngine(false);
        }
      }
    } finally {
      running.current = false;
    }
  }, []);

  const add = useCallback(
    (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif|tiff?)$/i.test(f.name));
      const tooBig = images.map((f) => sizeProblem(f, props)).find(Boolean);
      const ok = images.filter((f) => !sizeProblem(f, props));
      const take = batch ? ok : ok.slice(0, 1);
      setNote(tooBig ?? (images.length < files.length ? 'Only image files can be read here. For a PDF, use Edit Scanned PDF.' : null));
      if (!take.length) return;
      const fresh: Item[] = take.map((file) => ({ id: ++seq.current, file, url: URL.createObjectURL(file), status: 'waiting', progress: 0 }));
      setEdited(null);
      setItems((cur) => {
        if (!batch) cur.forEach((it) => URL.revokeObjectURL(it.url));
        return batch ? [...cur, ...fresh] : fresh;
      });
      setSelected(fresh[0].id);
      setTimeout(() => void runQueue(), 0);
    },
    [batch, props, runQueue],
  );

  // Paste a screenshot straight from the clipboard (Ctrl+V / Cmd+V).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      add(files.map((f, i) => new File([f], f.name && f.name !== 'image.png' ? f.name : `pasted-image-${i + 1}.png`, { type: f.type })));
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [add]);

  // Free the engine and the previews when leaving the page.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(
    () => () => {
      itemsRef.current.forEach((it) => URL.revokeObjectURL(it.url));
      stopOcr();
    },
    [],
  );

  const readAgain = () => {
    setEdited(null);
    setItems((cur) => cur.map((it) => ({ ...it, status: 'waiting', progress: 0, result: undefined, error: undefined })));
    setTimeout(() => void runQueue(), 0);
  };

  const done = items.filter((it) => it.status === 'done' && it.result);
  const combined = useMemo(
    () => (done.length > 1 ? done.map((it) => `--- ${it.file.name} ---\n${it.result!.text}`).join('\n\n') : (done[0]?.result?.text ?? '')),
    [done],
  );
  const text = edited ?? combined;
  const busy = items.some((it) => it.status === 'waiting' || it.status === 'reading');
  const current = items.find((it) => it.id === selected) ?? items[0];
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  if (!items.length)
    return (
      <div className="space-y-4">
        <Bench>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="label">Language of the text</span>
            <Segmented label="Language" value={lang} onChange={setLang} options={OCR_LANGS} />
          </div>
          <FileDrop accept={ACCEPT} multiple={batch} onFiles={add} props={props} label={batch ? 'Choose images' : 'Choose an image'} hint="JPG, PNG, WebP, screenshots · or paste with Ctrl+V" />
        </Bench>
        {note && <Notice tone="warn">{note}</Notice>}
      </div>
    );

  return (
    <Bench>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Language" value={lang} onChange={setLang} options={OCR_LANGS} />
        <label className="flex items-center gap-2 text-[0.92rem]" title="Greyscale with stronger contrast; helps faint, coloured or low-contrast text">
          <input type="checkbox" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} /> Improve faint text
        </label>
        <button type="button" className="btn btn-ghost !min-h-9 text-sm" disabled={busy} onClick={readAgain}>
          Read again with these settings
        </button>
        <span className="ml-auto text-[0.82rem] text-ink-3">Paste more screenshots with Ctrl+V</span>
      </div>
      {note && <Notice tone="warn">{note}</Notice>}

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {items.length > 1 && (
            <ul className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Images">
              {items.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(it.id)}
                    className={`block h-16 w-20 overflow-hidden border ${current?.id === it.id ? 'border-ink ring-1 ring-ink' : 'border-rule-2'}`}
                    aria-label={`Show ${it.file.name}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.url} alt="" className="h-full w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {current && (
            <div>
              <div className="relative bg-paper-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={current.url} alt={current.file.name} className="block max-h-[520px] w-full object-contain" />
                {showBoxes && current.result && (
                  <svg viewBox={`0 0 ${current.result.width} ${current.result.height}`} className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    {current.result.words
                      .filter((w) => w.confidence < UNSURE)
                      .map((w, i) => (
                        <rect key={i} x={w.box.x0} y={w.box.y0} width={w.box.x1 - w.box.x0} height={w.box.y1 - w.box.y0} fill="rgba(212,69,42,0.12)" stroke="#d4452a" strokeWidth={Math.max(2, current.result!.width / 600)} />
                      ))}
                  </svg>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[0.85rem]">
                <span className="truncate font-medium" title={current.file.name}>
                  {current.file.name}
                </span>
                {current.status === 'reading' && (
                  <span className="label" role="status">
                    {loadingEngine ? 'Loading the text reader (first time only)…' : `Reading… ${Math.round(current.progress * 100)}%`}
                  </span>
                )}
                {current.status === 'waiting' && <span className="label">Waiting…</span>}
                {current.status === 'error' && <span className="text-bad">{current.error}</span>}
                {current.result && (
                  <>
                    <span className="font-mono" style={{ color: `var(--${quality(current.result.confidence).tone})` }}>
                      {quality(current.result.confidence).label} · {current.result.confidence}% sure
                    </span>
                    <label className="ml-auto flex items-center gap-2">
                      <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Outline words to check
                    </label>
                  </>
                )}
              </div>
              {current.status === 'reading' && (
                <div className="mt-2 h-1.5 w-full bg-paper-2" aria-hidden="true">
                  <div className="h-full bg-signal transition-[width]" style={{ width: `${Math.max(4, current.progress * 100)}%` }} />
                </div>
              )}
              {current.result && current.result.confidence < 65 && (
                <Notice tone="warn">
                  Hard to read. A sharper photo taken straight on, cropping to just the text, or choosing the right language usually helps.
                </Notice>
              )}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col">
          <label htmlFor="ocr-text" className="label mb-1">
            Text found {words ? `· ${words} words` : ''} {edited !== null ? '· edited' : ''}
          </label>
          <textarea
            id="ocr-text"
            className="field min-h-[360px] flex-1 font-mono text-[0.9rem]"
            value={text}
            placeholder={busy ? 'Reading…' : 'No text was found in this image.'}
            onChange={(e) => setEdited(e.target.value)}
            spellCheck={false}
            lang={lang === 'hin' ? 'hi' : undefined}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={!text} onClick={() => copy(text)}>
              {copied ? 'Copied' : 'Copy text'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!text}
              onClick={() => download(new Blob([`﻿${text.replace(/\n/g, '\r\n')}`], { type: 'text/plain;charset=utf-8' }), `${items.length === 1 ? baseName(items[0].file.name) : 'image-text'}.txt`)}
            >
              Download .txt
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                items.forEach((it) => URL.revokeObjectURL(it.url));
                setItems([]);
                setEdited(null);
                setNote(null);
              }}
            >
              Start over
            </button>
          </div>
        </div>
      </div>
      <p className="mt-4 text-[0.8rem] text-ink-3">Read on your device. Your images are not uploaded.</p>
    </Bench>
  );
}
