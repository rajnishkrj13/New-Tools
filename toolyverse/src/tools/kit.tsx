'use client';

import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';

/** What every tool receives from its page: the admin's switches and this viewer's limits. */
export interface ToolProps {
  features: Record<string, boolean>;
  maxMb: number | null;
  memberMaxMb: number | null;
  signedIn: boolean;
}

export const formatSize = (n: number) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(n >= 10485760 ? 0 : 1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`;

export function download(data: Blob | Uint8Array, name: string, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data.slice().buffer], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const baseName = (name: string) => name.replace(/\.[^.]+$/, '');

/** A file that is too big for this visitor, with the reason in plain words. */
export function sizeProblem(file: File, p: ToolProps): string | null {
  if (!p.maxMb || file.size <= p.maxMb * 1048576) return null;
  const more = !p.signedIn && p.memberMaxMb && p.memberMaxMb > p.maxMb ? ` With a free account the limit is ${p.memberMaxMb} MB.` : '';
  return `${file.name} is ${formatSize(file.size)}; the limit here is ${p.maxMb} MB.${more}`;
}

export function FileDrop({
  accept,
  multiple,
  onFiles,
  props,
  label,
  hint,
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  props: ToolProps;
  label: string;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const problems = files.map((f) => sizeProblem(f, props)).filter(Boolean) as string[];
    setError(problems[0] ?? null);
    const ok = files.filter((f) => !sizeProblem(f, props));
    if (ok.length) onFiles(multiple ? ok : [ok[0]]);
  };
  return (
    <div>
      <div
        className="tray flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
        data-over={over}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
      >
        <button type="button" className="btn" onClick={() => input.current?.click()}>
          {label}
        </button>
        <p className="text-sm text-ink-3">
          or drop {multiple ? 'files' : 'a file'} here{props.maxMb ? ` · up to ${props.maxMb} MB each` : ''}
          {hint ? ` · ${hint}` : ''}
        </p>
        <input
          ref={input}
          type="file"
          hidden
          accept={accept}
          multiple={multiple}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {error && <Notice tone="bad">{error}{!props.signedIn && props.memberMaxMb && props.maxMb && props.memberMaxMb > props.maxMb ? <> <Link href="/signup" className="underline">Sign up free</Link></> : null}</Notice>}
      <p className="mt-2 text-[0.8rem] text-ink-3">Processed on your device. Nothing is uploaded.</p>
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'bad' | 'warn'; children: ReactNode }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : 'var(--ink-2)';
  return (
    <p role={tone === 'bad' ? 'alert' : 'status'} className="mt-3 border-l-[3px] bg-card px-3 py-2 text-[0.92rem]" style={{ borderColor: color, color: tone === 'info' ? undefined : color }}>
      {children}
    </p>
  );
}

/** The bordered work surface every tool sits on. */
export function Bench({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`border border-ink bg-card p-4 sm:p-6 ${className}`}>{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[0.8rem] text-ink-3">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap border border-ink">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 border-r border-ink px-3.5 text-[0.92rem] font-medium last:border-r-0 ${value === o.value ? 'bg-ink text-paper' : 'bg-card hover:bg-paper-2'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string, key = 'x') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };
  return { copied, copy };
}

export function Spinner({ text }: { text: string }) {
  return (
    <p className="label mt-3 flex items-center gap-2" role="status">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-ink-3 border-t-transparent" aria-hidden="true" />
      {text}
    </p>
  );
}
