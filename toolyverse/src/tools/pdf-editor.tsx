'use client';

import { useEffect, useRef, useState } from 'react';
import { type ToolProps } from './kit';

/**
 * The full PDF editor is its own app (pdf-editor/), built into /public/pdf-editor/app. It runs
 * in a frame on this page and reads the admin's feature switches from /api/tools/pdf-editor/config.
 */
export default function PdfEditor(props: ToolProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<'checking' | 'ready' | 'missing'>('checking');
  const [full, setFull] = useState(false);

  useEffect(() => {
    fetch('/pdf-editor/app/index.html', { method: 'HEAD' })
      .then((r) => setState(r.ok ? 'ready' : 'missing'))
      .catch(() => setState('missing'));
  }, []);

  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && e.target === document.body && setFull(false);
    window.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', esc);
    };
  }, [full]);

  if (state === 'missing')
    return (
      <div className="border border-ink bg-card p-8 text-center">
        <p className="display text-[1.4rem]">The editor is being updated</p>
        <p className="mt-2 text-ink-2">Please try again in a few minutes.</p>
      </div>
    );

  return (
    <div className={full ? 'fixed inset-0 z-50 flex flex-col bg-paper' : 'border border-ink'}>
      <div className="flex items-center justify-between gap-3 border-b border-ink bg-ink px-3 py-1.5 text-paper">
        <span className="label !text-paper">
          PDF Editor{props.maxMb ? ` · files up to ${props.maxMb} MB` : ''}
          {!props.signedIn && props.memberMaxMb && props.maxMb && props.memberMaxMb > props.maxMb ? ` (${props.memberMaxMb} MB with a free account)` : ''}
        </span>
        <button type="button" className="label !text-paper hover:underline" onClick={() => setFull(!full)}>
          {full ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>
      {state === 'ready' ? (
        <iframe
          ref={frame}
          title="PDF editor"
          src="/pdf-editor/app/index.html?embed=1"
          className={full ? 'w-full flex-1' : 'h-[82vh] min-h-[620px] w-full'}
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      ) : (
        <div className="flex h-[60vh] items-center justify-center bg-card text-ink-3">Loading the editor…</div>
      )}
    </div>
  );
}
