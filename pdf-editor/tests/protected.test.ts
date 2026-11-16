import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';
// @ts-ignore - plain JavaScript helper without type declarations
import { makeProtectedPdf } from './helpers/protectedPdf.mjs';
import { looksEncrypted, unlockPdf, WrongPasswordError } from '../src/engines/PdfTools';

type Method = 'rc4-128' | 'aes-128' | 'aes-256';
const METHODS: Method[] = ['rc4-128', 'aes-128', 'aes-256'];
const make = (method: Method, userPassword: string, ownerPassword = 'owner-pass'): Uint8Array =>
  makeProtectedPdf({ text: 'Protected document 4471', userPassword, ownerPassword, method });
const open = (bytes: Uint8Array, password?: string) => pdfjs.getDocument({ data: bytes.slice(), password, verbosity: 0 }).promise;
const textOf = async (bytes: Uint8Array) => (await (await (await open(bytes)).getPage(1)).getTextContent()).items.map((i: any) => i.str).join(' ');

// Files written for the browser checks (test-assets/protected, not committed).
const out = join(__dirname, '..', 'test-assets', 'protected');
mkdirSync(out, { recursive: true });
for (const m of METHODS) {
  writeFileSync(join(out, `${m}.pdf`), make(m, 'secret1'));
  writeFileSync(join(out, `${m}-edit-locked.pdf`), make(m, ''));
}

describe.each(METHODS)('protected PDF made by another program (%s)', (method) => {
  it('is a valid protected file: PDF.js needs the password and reads it with the password', async () => {
    const bytes = make(method, 'secret1');
    expect(looksEncrypted(bytes)).toBe(true);
    await expect(open(bytes)).rejects.toMatchObject({ name: 'PasswordException' });
    expect(await textOf(await unlockPdf(bytes, 'secret1'))).toContain('Protected document 4471');
    expect(await (await open(bytes, 'secret1')).numPages).toBe(1);
  });

  it('opens with the right password and refuses a wrong one', async () => {
    const bytes = make(method, 'secret1');
    await expect(unlockPdf(bytes, 'nope')).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(unlockPdf(bytes, '')).rejects.toBeInstanceOf(WrongPasswordError);
    const plain = await unlockPdf(bytes, 'secret1');
    // The copy needs no password and can be edited by the exporter's library.
    expect(await textOf(plain)).toContain('Protected document 4471');
    expect((await PDFDocument.load(plain)).getPageCount()).toBe(1);
  });

  it('opens a file that only restricts editing without any password', async () => {
    const bytes = make(method, '');
    expect(await textOf(await unlockPdf(bytes, ''))).toContain('Protected document 4471');
  });
});
