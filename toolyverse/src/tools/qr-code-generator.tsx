'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildPayload, describe, isQrType, typeDef, TYPES, type FieldDef, type Fields, type QrType } from '@/lib/qr/payload';
import { colourProblems, DEFAULT_STYLE, ECC_RECOVERY, encode, logoCover, renderSvg, type Ecc, type Logo, type QrStyle } from '@/lib/qr/render';
import { Bench, Notice, Segmented, download, formatSize, type ToolProps } from './kit';
import { useSaved } from './useSaved';

/** First visit: a working code to look at before anything is typed. */
const SAMPLE = 'https://toolyverse.com/qr-code-generator';
const SIZES = [128, 256, 512, 1024, 2048] as const;
type Size = (typeof SIZES)[number];
/** The types offered as buttons; the rest are in the "More" list. */
const QUICK: QrType[] = ['url', 'text', 'wifi', 'vcard', 'whatsapp', 'upi', 'email', 'phone'];

interface Saved {
  id: number;
  type: QrType;
  fields: Fields;
  style: QrStyle;
  label: string;
  data: string;
}

const ECC_OPTIONS: { value: Ecc; label: string }[] = [
  { value: 'L', label: 'L · 7%' },
  { value: 'M', label: 'M · 15%' },
  { value: 'Q', label: 'Q · 25%' },
  { value: 'H', label: 'H · 30%' },
];

const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/^[a-z ()]+:\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'code';

const initialFields = () => Object.fromEntries(TYPES.map((t) => [t.value, { ...t.initial }])) as Record<QrType, Fields>;

export default function QrCodeGenerator(props: ToolProps) {
  const allowLogo = props.features.logo !== false;
  const allowBatch = props.features.batch !== false;
  const allowHistory = props.features.history !== false;

  const startType: QrType = isQrType(props.preset?.type) ? props.preset.type : 'url';
  const [withLogo, setWithLogo] = useState(allowLogo && props.preset?.logo === 'on');
  const [type, setType] = useState<QrType>(startType);
  const [fields, setFields] = useState(initialFields);
  const [style, setStyle] = useState<QrStyle>(() => ({ ...DEFAULT_STYLE, ecc: allowLogo && props.preset?.logo === 'on' ? 'H' : 'M' }));
  const [size, setSize] = useState<Size>(1024);
  const [touched, setTouched] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [eccNote, setEccNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [scan, setScan] = useState<{ svg: string; ok: boolean; text: string | null } | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const history = useSaved<Saved[]>('qr-history', [], { signedIn: false, enabled: allowHistory });

  const f = fields[type];
  const def = typeDef(type);
  const built = useMemo(() => buildPayload(type, f), [type, f]);
  const showSample = !touched && !built.data;
  const data = built.data ?? (showSample ? SAMPLE : null);
  const effective: QrStyle = useMemo(() => ({ ...style, logo: withLogo ? style.logo : null }), [style, withLogo]);

  const { svg, matrixError, cover } = useMemo(() => {
    if (!data) return { svg: null, matrixError: null, cover: 0 };
    try {
      const m = encode(data, effective.ecc);
      return { svg: renderSvg(m, effective), matrixError: null, cover: logoCover(m, effective) };
    } catch (e) {
      return { svg: null, matrixError: (e as Error).message, cover: 0 };
    }
  }, [data, effective]);
  const previewSrc = useMemo(() => (svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null), [svg]);

  // Read the code back, as a phone would, a moment after the last change.
  useEffect(() => {
    if (!svg) return;
    let stale = false;
    const t = setTimeout(async () => {
      const { scanCheck } = await import('@/lib/qr/export');
      const r = await scanCheck(svg).catch(() => ({ ok: false, text: null }));
      if (!stale) setScan({ svg, ...r });
    }, 350);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [svg]);
  const scanState = !svg || scan?.svg !== svg ? 'checking' : scan.ok && scan.text === data ? 'ok' : scan.ok ? 'differs' : 'bad';

  const colours = colourProblems(effective);
  const tooMuchLogo = withLogo && !!style.logo && cover > ECC_RECOVERY[style.ecc] * 0.85;
  const thinMargin = style.margin < 2;

  const setField = (key: string, value: string) => {
    setTouched(true);
    setFields((cur) => ({ ...cur, [type]: { ...cur[type], [key]: value } }));
  };
  const patch = (p: Partial<QrStyle>) => setStyle((s) => ({ ...s, ...p }));

  const chooseLogoMode = (on: boolean) => {
    setWithLogo(on);
    if (on && style.ecc !== 'H') {
      patch({ ecc: 'H' });
      setEccNote('Error correction set to H (high), recommended with a logo: the code stays readable even with its centre covered.');
    } else setEccNote(null);
  };

  const takeLogo = async (file: File | undefined) => {
    if (!file) return;
    setLogoError(null);
    if (props.maxMb && file.size > props.maxMb * 1048576) {
      setLogoError(`${file.name} is ${formatSize(file.size)}; the limit is ${props.maxMb} MB.`);
      return;
    }
    try {
      const { prepareLogo } = await import('@/lib/qr/export');
      const logo: Logo = await prepareLogo(file);
      setStyle((s) => ({ ...s, logo, ecc: 'H' }));
      setWithLogo(true);
    } catch (e) {
      setLogoError((e as Error).message);
    }
  };

  const say = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2200);
  };

  const remember = () => {
    if (!allowHistory || !svg || !data) return;
    const keepLogo = effective.logo && effective.logo.src.length < 160_000 ? effective.logo : null;
    const item: Saved = { id: Math.max(0, ...history.value.map((h) => h.id)) + 1, type, fields: { ...f }, style: { ...effective, logo: keepLogo }, label: showSample ? 'Sample' : describe(type, f, data), data };
    const rest = history.value.filter((h) => !(h.data === data && JSON.stringify({ ...h.style, logo: null }) === JSON.stringify({ ...item.style, logo: null })));
    void history.save([item, ...rest].slice(0, 12));
  };

  const fileBase = `qr-${type}-${slugOf(showSample ? 'sample' : describe(type, f, data ?? ''))}`;

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    try {
      await fn();
      remember();
    } catch (e) {
      say((e as Error).message || 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const save = (fmt: 'png' | 'jpg' | 'svg' | 'pdf') =>
    run(fmt, async () => {
      const x = await import('@/lib/qr/export');
      if (!svg) return;
      if (fmt === 'png') download(await x.pngBlob(svg, size), `${fileBase}.png`);
      if (fmt === 'jpg') download(await x.jpgBlob(svg, size, effective.transparent ? '#ffffff' : effective.bg), `${fileBase}.jpg`);
      if (fmt === 'svg') download(x.svgBlob(svg, size), `${fileBase}.svg`);
      if (fmt === 'pdf') download(await x.pdfBlob([{ svg }]), `${fileBase}.pdf`);
    });

  const restore = (h: Saved) => {
    setType(h.type);
    setFields((cur) => ({ ...cur, [h.type]: { ...typeDef(h.type).initial, ...h.fields } }));
    setStyle({ ...DEFAULT_STYLE, ...h.style, logo: h.style.logo ?? style.logo });
    setWithLogo(allowLogo && !!h.style.logo);
    setTouched(true);
    setEccNote(null);
  };

  const resetAll = () => {
    setFields(initialFields());
    setStyle({ ...DEFAULT_STYLE, ecc: withLogo ? 'H' : 'M' });
    setSize(1024);
    setTouched(false);
    setEccNote(null);
    setLogoError(null);
  };

  return (
    <Bench>
      <div className="flex flex-wrap items-center gap-3">
        {allowLogo && (
          <Segmented
            label="Logo"
            value={withLogo ? 'logo' : 'plain'}
            onChange={(v) => chooseLogoMode(v === 'logo')}
            options={[
              { value: 'plain', label: 'Without logo' },
              { value: 'logo', label: 'With logo' },
            ]}
          />
        )}
        <span className="text-[0.82rem] text-ink-3">Free, no sign-up. Made in your browser; nothing is uploaded.</span>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ---- Left: what goes in the code, and how it looks ---- */}
        <div className="min-w-0">
          <fieldset>
            <legend className="label mb-2">What should the code open?</legend>
            <div className="flex flex-wrap gap-1.5">
              {QUICK.map((t) => (
                <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t} className={`min-h-9 border px-3 text-[0.88rem] ${type === t ? 'border-ink bg-ink text-paper' : 'border-rule-2 bg-card hover:border-ink'}`}>
                  {typeDef(t).label}
                </button>
              ))}
              <select
                aria-label="More QR code types"
                className={`field !min-h-9 !w-auto !py-0 text-[0.88rem] ${QUICK.includes(type) ? '' : '!border-ink font-medium'}`}
                value={QUICK.includes(type) ? '' : type}
                onChange={(e) => e.target.value && setType(e.target.value as QrType)}
              >
                <option value="">More types…</option>
                {TYPES.filter((t) => !QUICK.includes(t.value)).map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {def.fields.map((fd) => (
              <FieldInput key={`${type}-${fd.key}`} def={fd} value={f[fd.key] ?? ''} onChange={(v) => setField(fd.key, v)} />
            ))}
          </div>
          <p className="mt-2 text-[0.85rem] text-ink-3">When scanned: {def.scans}</p>
          {touched && built.error && <Notice tone="warn">{built.error}</Notice>}
          {type === 'upi' && built.data && <Notice>Before printing, scan it with your own UPI app and check that your name appears as the payee. Collecting money does not need a merchant account.</Notice>}

          {withLogo && allowLogo && (
            <Panel title="Logo" open>
              <div
                className="flex flex-wrap items-center gap-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void takeLogo(e.dataTransfer.files[0]);
                }}
              >
                {style.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={style.logo.src} alt="Your logo" className="h-14 w-14 border border-rule-2 bg-paper-2 object-contain p-1" />
                ) : (
                  <span className="grid h-14 w-14 place-items-center border border-dashed border-rule-2 text-[0.75rem] text-ink-3">No logo</span>
                )}
                <button type="button" className="btn !min-h-9 text-sm" onClick={() => logoInput.current?.click()}>
                  {style.logo ? 'Change logo' : 'Upload logo'}
                </button>
                {style.logo && (
                  <button type="button" className="btn btn-ghost !min-h-9 text-sm" onClick={() => patch({ logo: null })}>
                    Remove
                  </button>
                )}
                <span className="text-[0.8rem] text-ink-3">PNG, JPG, SVG or WebP · or drop it here</span>
                <input
                  ref={logoInput}
                  type="file"
                  hidden
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                  onChange={(e) => {
                    void takeLogo(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
              {logoError && <Notice tone="bad">{logoError}</Notice>}
              {style.logo && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Range label="Logo size" value={Math.round(style.logoSize * 100)} min={12} max={32} unit="%" onChange={(v) => patch({ logoSize: v / 100 })} />
                  <Range label="Space around logo" value={style.logoPad} min={0} max={3} step={0.5} onChange={(v) => patch({ logoPad: v })} />
                  <div>
                    <span className="label mb-1 block">Logo background</span>
                    <Segmented
                      label="Logo background"
                      value={style.logoPlate}
                      onChange={(v) => patch({ logoPlate: v })}
                      options={[
                        { value: 'none', label: 'None' },
                        { value: 'square', label: 'Square' },
                        { value: 'rounded', label: 'Rounded' },
                        { value: 'circle', label: 'Circle' },
                      ]}
                    />
                  </div>
                  {style.logoPlate !== 'none' && <Colour label="Background colour" value={style.logoPlateColor} onChange={(v) => patch({ logoPlateColor: v })} />}
                </div>
              )}
              {!style.logo && <p className="mt-2 text-[0.85rem] text-ink-3">Upload a logo to place it in the centre. A square logo on a plain background looks best.</p>}
            </Panel>
          )}
          {eccNote && <Notice tone="ok">{eccNote}</Notice>}

          <Panel title="Colours">
            <div className="grid gap-4 sm:grid-cols-2">
              <Colour label={style.gradient === 'none' ? 'Code colour' : 'Gradient start'} value={style.fg} onChange={(v) => patch({ fg: v })} />
              {style.gradient !== 'none' && <Colour label="Gradient end" value={style.fg2} onChange={(v) => patch({ fg2: v })} />}
              <div>
                <span className="label mb-1 block">Fill</span>
                <Segmented
                  label="Fill"
                  value={style.gradient}
                  onChange={(v) => patch({ gradient: v })}
                  options={[
                    { value: 'none', label: 'Solid' },
                    { value: 'linear', label: 'Gradient' },
                    { value: 'radial', label: 'Radial' },
                  ]}
                />
              </div>
              <div>
                <Colour label="Background" value={style.bg} disabled={style.transparent} onChange={(v) => patch({ bg: v })} />
                <label className="mt-2 flex items-center gap-2 text-[0.88rem]">
                  <input type="checkbox" checked={style.transparent} onChange={(e) => patch({ transparent: e.target.checked })} /> Transparent background (PNG, SVG)
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-[0.88rem]">
                  <input type="checkbox" checked={!!style.eye} onChange={(e) => patch({ eye: e.target.checked ? '#d4452a' : '' })} /> Different colour for the corners
                </label>
                {style.eye && (
                  <div className="mt-2">
                    <Colour label="Corner colour" value={style.eye} onChange={(v) => patch({ eye: v })} />
                  </div>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Shape">
            <div className="grid gap-4">
              <Choice label="Pattern" value={style.dots} onChange={(v) => patch({ dots: v })} options={[{ value: 'square', label: 'Square' }, { value: 'rounded', label: 'Rounded' }, { value: 'dots', label: 'Dots' }]} />
              <Choice label="Corner frames" value={style.eyeFrame} onChange={(v) => patch({ eyeFrame: v })} options={[{ value: 'square', label: 'Square' }, { value: 'rounded', label: 'Rounded' }, { value: 'circle', label: 'Circle' }]} />
              <Choice label="Corner centres" value={style.eyeDot} onChange={(v) => patch({ eyeDot: v })} options={[{ value: 'square', label: 'Square' }, { value: 'rounded', label: 'Rounded' }, { value: 'circle', label: 'Dot' }]} />
            </div>
            <p className="mt-2 text-[0.8rem] text-ink-3">Square scans best everywhere. Round styles look friendlier and read fine on today’s phones; test with an older phone if your audience may use one.</p>
          </Panel>

          <Panel title="Advanced">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="label mb-1 block">Error correction</span>
                <Segmented label="Error correction" value={style.ecc} onChange={(v) => {
                    setEccNote(null);
                    patch({ ecc: v });
                  }} options={ECC_OPTIONS} />
                <span className="mt-1 block text-[0.8rem] text-ink-3">How much of the code can be damaged or covered and still scan. Higher makes a denser code. Use H with a logo.</span>
              </div>
              <Range label="Margin (quiet zone)" value={style.margin} min={0} max={8} unit=" squares" onChange={(v) => patch({ margin: v })} hint="Scanners need clear space around the code. 4 is the standard." />
            </div>
          </Panel>
        </div>

        {/* ---- Right: the code, and what to do with it ---- */}
        <div className="min-w-0">
          <div className="lg:sticky lg:top-4">
            <div className="border border-ink p-3" style={{ background: effective.transparent ? 'repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0 / 16px 16px' : 'var(--paper-2)' }}>
              {previewSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewSrc} alt={showSample ? 'Sample QR code' : `QR code: ${describe(type, f, data ?? '')}`} className="mx-auto block aspect-square w-full max-w-[300px]" />
              ) : (
                <div className="mx-auto grid aspect-square w-full max-w-[300px] place-items-center p-6 text-center text-[0.9rem] text-ink-3">{matrixError ?? built.error ?? 'Fill in the form to make your code.'}</div>
              )}
            </div>
            <div className="mt-2 min-h-6 text-[0.85rem]" aria-live="polite">
              {showSample ? (
                <span className="text-ink-3">Sample code. Fill in the form and yours appears here.</span>
              ) : svg ? (
                scanState === 'checking' ? (
                  <span className="label">Checking it scans…</span>
                ) : scanState === 'ok' ? (
                  <span style={{ color: 'var(--ok)' }}>✓ Scan check passed: reads back exactly.</span>
                ) : scanState === 'differs' ? (
                  <span style={{ color: 'var(--warn)' }}>Reads, but the text came back different. Test with your phone.</span>
                ) : (
                  <span style={{ color: 'var(--bad)' }}>✗ Scan check failed: phones may not read this code.</span>
                )
              ) : null}
            </div>
            {svg && scanState === 'bad' && (
              <Notice tone="bad">{withLogo && style.logo ? 'Make the logo smaller, set error correction to H, or use darker colours.' : 'Use darker dots on a light background, a wider margin, or less text.'}</Notice>
            )}
            {svg && tooMuchLogo && scanState !== 'bad' && <Notice tone="warn">The logo covers a lot of the code. It may scan on new phones but fail on older ones; make it smaller or use error correction H.</Notice>}
            {svg && colours.map((c) => <Notice key={c} tone="warn">{c}</Notice>)}
            {svg && thinMargin && <Notice tone="warn">A margin under 2 squares makes the code hard to read when printed on a busy background.</Notice>}

            <div className="mt-4">
              <span className="label mb-1 block">Size</span>
              <Segmented label="Download size in pixels" value={String(size)} onChange={(v) => setSize(Number(v) as Size)} options={SIZES.map((s) => ({ value: String(s), label: s === 2048 ? '2048 HD' : String(s) }))} />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {(['png', 'jpg', 'svg', 'pdf'] as const).map((fmt) => (
                <button key={fmt} type="button" className={`btn !min-h-10 !px-2 text-sm ${fmt === 'png' ? '' : 'btn-ghost'}`} disabled={!svg || !!busy || showSample} onClick={() => save(fmt)}>
                  {busy === fmt ? '…' : fmt.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <button
                type="button"
                className="btn btn-ghost !min-h-9 !px-2 text-sm"
                disabled={!svg || !!busy || showSample}
                onClick={() =>
                  run('copy', async () => {
                    const { copyImage } = await import('@/lib/qr/export');
                    say((await copyImage(svg!, Math.min(size, 1024))) ? 'Copied. Paste it into your document.' : 'This browser cannot copy images; download the PNG instead.');
                  })
                }
              >
                {busy === 'copy' ? '…' : 'Copy image'}
              </button>
              <button
                type="button"
                className="btn btn-ghost !min-h-9 !px-2 text-sm"
                disabled={!svg || !!busy || showSample}
                onClick={() =>
                  run('print', async () => {
                    const { printCodes } = await import('@/lib/qr/export');
                    await printCodes([{ svg: svg! }]);
                  })
                }
              >
                Print
              </button>
              <button type="button" className="btn btn-ghost !min-h-9 !px-2 text-sm" onClick={resetAll}>
                Reset
              </button>
            </div>
            {flash && <Notice tone="ok">{flash}</Notice>}
            <p className="mt-3 text-[0.8rem] leading-snug text-ink-3">
              Static QR code: what you typed is stored inside the code itself, so it works without Toolyverse and has no expiry date. It cannot be edited after printing; if a link or number changes, make a new code. Always test it with your phone before printing.
            </p>
          </div>
        </div>
      </div>

      {allowHistory && history.value.length > 0 && (
        <section className="mt-8 border-t border-rule pt-5" aria-label="Recent QR codes">
          <div className="flex items-center gap-3">
            <h3 className="label">Your recent codes (saved in this browser)</h3>
            <button type="button" className="ml-auto text-[0.82rem] text-ink-3 underline" onClick={() => void history.save([])}>
              Clear
            </button>
          </div>
          <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {history.value.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => restore(h)} className="block w-full border border-rule-2 p-1.5 text-left hover:border-ink" title={`Open: ${h.label}`}>
                  <HistoryThumb item={h} />
                  <span className="mt-1 block truncate text-[0.75rem]">{h.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {allowBatch && <Batch style={effective} />}
    </Bench>
  );
}

// ---- pieces ------------------------------------------------------------------------------------

function Panel({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="group mt-4 border-t border-rule pt-3" open={open}>
      <summary className="label flex cursor-pointer list-none items-center gap-2 py-1 select-none">
        <span className="inline-block w-3 transition-transform group-open:rotate-90" aria-hidden="true">
          ›
        </span>
        {title}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <span className="label mb-1 block">{label}</span>
      <Segmented label={label} value={value} onChange={onChange} options={options} />
    </div>
  );
}

function Colour({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  // Keep the typed text in step when the colour changes elsewhere (picker, reset, history).
  if (shown !== value) {
    setShown(value);
    setText(value);
  }
  return (
    <label className={`block ${disabled ? 'opacity-50' : ''}`}>
      <span className="label mb-1 block">{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer border border-ink bg-card p-0.5" aria-label={`${label} picker`} />
        <input
          className="field !w-28 font-mono text-[0.88rem]"
          value={text}
          disabled={disabled}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            const hex = v.startsWith('#') ? v : `#${v}`;
            if (/^#[0-9a-f]{6}$/i.test(hex)) onChange(hex.toLowerCase());
          }}
        />
      </span>
    </label>
  );
}

function Range({ label, value, min, max, step = 1, unit = '', hint, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; hint?: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="label mb-1 flex justify-between">
        <span>{label}</span>
        <span className="font-mono normal-case">
          {value}
          {unit}
        </span>
      </span>
      <input type="range" className="w-full accent-[var(--signal)]" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="mt-1 block text-[0.8rem] text-ink-3">{hint}</span>}
    </label>
  );
}

function FieldInput({ def, value, onChange }: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  const [reveal, setReveal] = useState(false);
  const wide = def.half ? '' : 'sm:col-span-2';
  if (def.kind === 'checkbox')
    return (
      <label className={`flex items-center gap-2 self-end pb-2 text-[0.92rem] ${wide}`}>
        <input type="checkbox" checked={value === 'true'} onChange={(e) => onChange(e.target.checked ? 'true' : '')} /> {def.label}
      </label>
    );
  const common = { id: `qr-${def.key}`, className: 'field', value, placeholder: def.placeholder, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  return (
    <div className={wide}>
      <label htmlFor={common.id} className="label mb-1 block">
        {def.label}
      </label>
      {def.kind === 'textarea' ? (
        <textarea {...common} rows={3} />
      ) : def.kind === 'select' ? (
        <select {...common}>
          {def.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : def.kind === 'password' ? (
        <span className="flex gap-1.5">
          <input {...common} type={reveal ? 'text' : 'password'} autoComplete="off" spellCheck={false} />
          <button type="button" className="btn btn-ghost !min-h-10 !px-2.5 text-sm" onClick={() => setReveal((r) => !r)} aria-pressed={reveal}>
            {reveal ? 'Hide' : 'Show'}
          </button>
        </span>
      ) : (
        <input {...common} type={def.kind === 'datetime' ? 'datetime-local' : def.inputMode === 'email' ? 'email' : def.inputMode === 'url' ? 'url' : def.inputMode === 'tel' ? 'tel' : 'text'} inputMode={def.inputMode} autoComplete="off" spellCheck={false} />
      )}
      {def.hint && <span className="mt-1 block text-[0.8rem] text-ink-3">{def.hint}</span>}
    </div>
  );
}

function HistoryThumb({ item }: { item: Saved }) {
  const src = useMemo(() => {
    try {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSvg(encode(item.data, item.style.ecc), item.style))}`;
    } catch {
      return null;
    }
  }, [item]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className="aspect-square w-full" /> : <span className="block aspect-square w-full bg-paper-2" />;
}

/** Many codes at once: one link or text per line, same design, as one PDF sheet or separate PNGs. */
function Batch({ style }: { style: QrStyle }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const lines = useMemo(
    () =>
      text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 100),
    [text],
  );
  const codes = useMemo(
    () =>
      lines.map((line) => {
        try {
          return { line, svg: renderSvg(encode(line, style.ecc), style) };
        } catch (e) {
          return { line, error: (e as Error).message };
        }
      }),
    [lines, style],
  );
  const good = codes.filter((c): c is { line: string; svg: string } => 'svg' in c && !!c.svg);
  return (
    <details className="group mt-8 border-t border-rule pt-4">
      <summary className="label flex cursor-pointer list-none items-center gap-2 select-none">
        <span className="inline-block w-3 transition-transform group-open:rotate-90" aria-hidden="true">
          ›
        </span>
        Make many QR codes at once
      </summary>
      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <label htmlFor="qr-batch" className="label mb-1 block">
            One link or text per line (up to 100)
          </label>
          <textarea id="qr-batch" className="field min-h-[180px] font-mono text-[0.85rem]" value={text} onChange={(e) => setText(e.target.value)} placeholder={'https://example.com/product-1\nhttps://example.com/product-2\nTable 3'} spellCheck={false} />
          <p className="mt-1 text-[0.8rem] text-ink-3">Uses the colours, shape and logo chosen above. Each code is labelled with its text in the PDF.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn"
              disabled={!good.length || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const { pdfBlob } = await import('@/lib/qr/export');
                  download(await pdfBlob(good.map((c) => ({ svg: c.svg, label: c.line }))), 'qr-codes.pdf');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Making PDF…' : good.length ? `Download ${good.length} as PDF` : 'Download as PDF'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!good.length || busy}
              onClick={async () => {
                setBusy(true);
                setMsg(null);
                try {
                  const { pngBlob } = await import('@/lib/qr/export');
                  for (const [i, c] of good.entries()) {
                    download(await pngBlob(c.svg, 1024), `qr-${String(i + 1).padStart(3, '0')}-${slugOf(c.line)}.png`);
                    await new Promise((r) => setTimeout(r, 250));
                  }
                  setMsg('If only one file arrived, allow this site to download several files when the browser asks.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Download PNGs
            </button>
          </div>
          {msg && <Notice>{msg}</Notice>}
          {codes.some((c) => 'error' in c) && <Notice tone="warn">{codes.filter((c) => 'error' in c).length} line(s) are too long for a QR code and were skipped.</Notice>}
        </div>
        {good.length > 0 && (
          <ul className="grid max-h-[340px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {good.map((c, i) => (
              <li key={i} className="border border-rule-2 p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.svg)}`} alt={c.line} className="aspect-square w-full" />
                <span className="block truncate text-[0.7rem]">{c.line}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
