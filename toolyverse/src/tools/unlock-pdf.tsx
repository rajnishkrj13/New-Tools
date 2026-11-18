'use client';

import { useRef, useState } from 'react';
import { looksEncrypted, unlockPdf, WrongPasswordError } from '@editor/engines/PdfTools';
import { Bench, FileDrop, Notice, Spinner, baseName, download, formatSize, type ToolProps } from './kit';

type Status =
  | { kind: 'checking' }
  | { kind: 'plain' }
  | { kind: 'locked'; wrong?: boolean }
  | { kind: 'done'; bytes: Uint8Array; pages: number; restrictionsOnly: boolean }
  | { kind: 'error'; message: string };

interface Item {
  id: number;
  file: File;
  bytes: Uint8Array;
  status: Status;
}

const outName = (f: File) => `${baseName(f.name)}-unlocked.pdf`;

async function pageCount(bytes: Uint8Array) {
  const { PDFDocument } = await import('pdf-lib');
  return (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount();
}

/** Unlocks one file; returns the new status. An empty password lifts restriction-only protection. */
async function tryUnlock(bytes: Uint8Array, password: string): Promise<Status> {
  try {
    const open = await unlockPdf(bytes, password);
    return { kind: 'done', bytes: open, pages: await pageCount(open), restrictionsOnly: password === '' };
  } catch (e) {
    if (e instanceof WrongPasswordError) return { kind: 'locked', wrong: password !== '' };
    const m = (e as Error).message ?? '';
    return {
      kind: 'error',
      message: /certificate|PubSec|public key|Unsupported|not supported/i.test(m)
        ? 'This PDF uses certificate protection, which only the holder of the certificate can open.'
        : 'This file could not be unlocked. It may be damaged; try opening and saving it again in a PDF reader.',
    };
  }
}

export default function UnlockPdf(props: ToolProps) {
  const batch = props.features.batch !== false;
  const [items, setItems] = useState<Item[]>([]);
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const update = (id: number, status: Status) => setItems((cur) => cur.map((it) => (it.id === id ? { ...it, status } : it)));

  const add = async (files: File[]) => {
    const fresh: Item[] = [];
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      fresh.push({ id: ++seq.current, file, bytes, status: { kind: 'checking' } });
    }
    setItems((cur) => [...(batch ? cur : []), ...fresh]);
    for (const it of fresh) {
      const head = new TextDecoder('latin1').decode(it.bytes.subarray(0, 1024));
      if (!head.includes('%PDF')) {
        update(it.id, { kind: 'error', message: 'This file is not a PDF.' });
        continue;
      }
      if (!looksEncrypted(it.bytes)) {
        update(it.id, { kind: 'plain' });
        continue;
      }
      // Many "locked" PDFs only stop printing or copying and open without a password.
      update(it.id, await tryUnlock(it.bytes, ''));
    }
  };

  const unlockAll = async () => {
    if (!pw) return;
    setBusy(true);
    try {
      for (const it of items) if (it.status.kind === 'locked') update(it.id, await tryUnlock(it.bytes, pw));
    } finally {
      setBusy(false);
    }
  };

  const done = items.filter((it): it is Item & { status: Extract<Status, { kind: 'done' }> } => it.status.kind === 'done');
  const locked = items.filter((it) => it.status.kind === 'locked');
  const wrong = locked.filter((it) => it.status.kind === 'locked' && it.status.wrong);

  const save = (it: Item & { status: Extract<Status, { kind: 'done' }> }) => download(it.status.bytes, outName(it.file), 'application/pdf');

  if (!items.length)
    return (
      <>
        <FileDrop accept="application/pdf,.pdf" multiple={batch} onFiles={add} props={props} label={batch ? 'Choose locked PDFs' : 'Choose a locked PDF'} hint="you need the password" />
        <p className="mt-2 text-[0.8rem] text-ink-3">Only for PDFs you are allowed to open. A forgotten password cannot be recovered here or anywhere.</p>
      </>
    );

  return (
    <Bench>
      <ul className="divide-y divide-rule border-y border-rule">
        {items.map((it) => (
          <li key={it.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
            <span className="min-w-0 flex-1 truncate font-medium" title={it.file.name}>
              {it.file.name} <span className="font-normal text-ink-3">· {formatSize(it.file.size)}</span>
            </span>
            <StatusLabel status={it.status} />
            {it.status.kind === 'done' && (
              <button type="button" className="btn !min-h-9 text-sm" onClick={() => save(it as Item & { status: Extract<Status, { kind: 'done' }> })}>
                Download
              </button>
            )}
            <button type="button" className="text-[0.82rem] text-ink-3 underline" onClick={() => setItems((cur) => cur.filter((x) => x.id !== it.id))} aria-label={`Remove ${it.file.name}`}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      {locked.length > 0 && (
        <form
          className="mt-5 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            void unlockAll();
          }}
        >
          <label htmlFor="unlock-pw" className="label mb-1 block">
            {locked.length > 1 ? `Password for the ${locked.length} locked files` : 'Password that opens this PDF'}
          </label>
          <div className="flex gap-1.5">
            <input id="unlock-pw" type={show ? 'text' : 'password'} className="field" autoComplete="off" spellCheck={false} value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
            <button type="button" className="btn btn-ghost !px-3 text-sm" onClick={() => setShow((s) => !s)} aria-pressed={show}>
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="mt-1 text-[0.8rem] text-ink-3">Bank and card statements often use your date of birth (such as 01011990 or 0101) or part of your name and mobile number; the bank’s email says which.</p>
          <button type="submit" className="btn mt-3" disabled={!pw || busy}>
            Unlock{locked.length > 1 ? ` ${locked.length} files` : ''}
          </button>
          {wrong.length > 0 && !busy && (
            <Notice tone="bad">
              {wrong.length === 1 ? `That password does not open ${wrong[0].file.name}.` : `That password does not open ${wrong.length} of the files.`} Passwords are case-sensitive; check Caps Lock.
            </Notice>
          )}
        </form>
      )}
      {busy && <Spinner text="Unlocking…" />}

      <div className="mt-5 flex flex-wrap gap-2">
        {done.length > 1 && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              for (const it of done) {
                save(it);
                await new Promise((r) => setTimeout(r, 300));
              }
            }}
          >
            Download all {done.length}
          </button>
        )}
        {batch && (
          <label className="btn btn-ghost cursor-pointer">
            Add more PDFs
            <input
              type="file"
              hidden
              multiple
              accept="application/pdf,.pdf"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []).filter((f) => !props.maxMb || f.size <= props.maxMb * 1048576);
                if (files.length) void add(files);
                e.target.value = '';
              }}
            />
          </label>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setItems([]);
            setPw('');
          }}
        >
          Start over
        </button>
      </div>
      {done.length > 0 && <Notice tone="ok">Unlocked copies open without a password and can be printed, copied, edited, merged or compressed. Keep them as safe as the originals.</Notice>}
      <p className="mt-4 text-[0.8rem] text-ink-3">Unlocked on your device. Your PDFs and password are not uploaded.</p>
    </Bench>
  );
}

function StatusLabel({ status }: { status: Status }) {
  switch (status.kind) {
    case 'checking':
      return <span className="label">Checking…</span>;
    case 'plain':
      return <span className="text-[0.88rem] text-ink-3">No password on this file: nothing to remove</span>;
    case 'locked':
      return <span className="text-[0.88rem]" style={{ color: status.wrong ? 'var(--bad)' : 'var(--warn)' }}>{status.wrong ? 'Wrong password' : 'Needs its password'}</span>;
    case 'done':
      return (
        <span className="text-[0.88rem]" style={{ color: 'var(--ok)' }}>
          ✓ Unlocked · {status.pages} {status.pages === 1 ? 'page' : 'pages'}
          {status.restrictionsOnly ? ' · print and copy limits removed' : ''}
        </span>
      );
    case 'error':
      return <span className="text-[0.88rem] text-bad">{status.message}</span>;
  }
}
