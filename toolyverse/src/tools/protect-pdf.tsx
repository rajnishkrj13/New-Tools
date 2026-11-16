'use client';

import { useState } from 'react';
import { FULL_PERMISSIONS, lockPdf } from '@editor/engines/PdfTools';
import { Bench, Field, FileDrop, Notice, Spinner, baseName, download, type ToolProps } from './kit';
import { usePdfFile } from './usePdfFile';

export default function ProtectPdf(props: ToolProps) {
  const pdf = usePdfFile();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [noPrint, setNoPrint] = useState(false);
  const [noCopy, setNoCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!pdf.file || !pdf.bytes)
    return (
      <>
        <FileDrop accept="application/pdf,.pdf" onFiles={(f) => (setDone(false), pdf.open(f[0]))} props={props} label="Choose a PDF" />
        {pdf.error && <Notice tone="bad">{pdf.error}</Notice>}
      </>
    );

  const problem = !pw ? null : pw.length < 4 ? 'Use at least 4 characters.' : pw2 && pw !== pw2 ? 'The two passwords are different.' : null;
  const ready = pw.length >= 4 && pw === pw2;

  const run = async () => {
    setBusy(true);
    setDone(false);
    try {
      const restricted = noPrint || noCopy;
      // Restrictions need a separate owner password; a random one nobody knows keeps them in place.
      const owner = restricted ? `${pw}:${crypto.getRandomValues(new Uint32Array(4)).join('')}` : pw;
      const bytes = await lockPdf(pdf.bytes!, {
        userPassword: pw,
        ownerPassword: owner,
        permissions: { ...FULL_PERMISSIONS, printing: noPrint ? 'none' : 'high', copying: !noCopy },
      });
      download(bytes, `${baseName(pdf.file!.name)}-protected.pdf`, 'application/pdf');
      setDone(true);
    } catch (e) {
      pdf.setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Bench>
      <p className="label">
        {pdf.file.name} · {pdf.pages} pages
      </p>
      <div className="mt-4 grid max-w-xl gap-4 sm:grid-cols-2">
        <Field label="Password">
          <input type="password" autoComplete="new-password" className="field" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Field label="Type it again">
          <input type="password" autoComplete="new-password" className="field" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 space-y-2 text-[0.94rem]">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={noPrint} onChange={(e) => setNoPrint(e.target.checked)} /> Do not allow printing
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={noCopy} onChange={(e) => setNoCopy(e.target.checked)} /> Do not allow copying text
        </label>
      </div>
      {problem && <Notice tone="bad">{problem}</Notice>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={!ready || busy} onClick={run}>
          Protect and download
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => (pdf.reset(), setDone(false), setPw(''), setPw2(''))}>
          Another PDF
        </button>
      </div>
      {busy && <Spinner text="Encrypting with AES-256…" />}
      {pdf.error && <Notice tone="bad">{pdf.error}</Notice>}
      {done && <Notice tone="ok">Done. The file now opens only with the password. Keep it safe: it cannot be recovered.</Notice>}
    </Bench>
  );
}
