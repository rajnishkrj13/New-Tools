'use client';

import { useState } from 'react';
import { looksEncrypted } from '@editor/engines/PdfTools';

/** Reads one chosen PDF and its page count, with plain-language errors. */
export function usePdfFile() {
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pages, setPages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const open = async (f: File, opts: { allowEncrypted?: boolean } = {}) => {
    setError(null);
    try {
      const b = new Uint8Array(await f.arrayBuffer());
      if (!opts.allowEncrypted && looksEncrypted(b)) throw new Error('This PDF is password-protected. Open it in the PDF Editor to remove the password first.');
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.load(b, { ignoreEncryption: !!opts.allowEncrypted, updateMetadata: false });
      setFile(f);
      setBytes(b);
      setPages(doc.getPageCount());
    } catch (e) {
      const m = (e as Error).message;
      setError(/Failed to parse|No PDF header|Invalid/i.test(m) ? 'This file is not a readable PDF.' : m);
    }
  };

  const reset = () => {
    setFile(null);
    setBytes(null);
    setPages(0);
    setError(null);
  };

  return { file, bytes, pages, error, setError, open, reset };
}
