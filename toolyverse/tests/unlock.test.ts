import { describe, expect, it } from 'vitest';
import { PDFDocument as Plain } from 'pdf-lib';
import { PDFDocument as Cantoo } from '@cantoo/pdf-lib';
import { looksEncrypted, unlockPdf, WrongPasswordError } from '@editor/engines/PdfTools';

/** Unlock PDF: every common encryption is removed completely, and only with the right password. */

const ALGORITHMS = ['AES-256', 'AES-128', 'RC4-128', 'RC4-40'] as const;

async function lockedPdf(algorithm: (typeof ALGORITHMS)[number], userPassword: string) {
  const doc = await Cantoo.create();
  doc.addPage([300, 200]).drawText('Salary slip November 2026', { x: 20, y: 150, size: 14 });
  doc.addPage([300, 200]).drawText('Page two', { x: 20, y: 150, size: 12 });
  doc.encrypt({ algorithm, allowWeakCryptography: true, userPassword, ownerPassword: 'owner-pass', permissions: { printing: 'lowResolution', copying: false, modifying: false } });
  return doc.save();
}

const latin1 = (b: Uint8Array) => Buffer.from(b).toString('latin1');

describe('Unlock PDF', () => {
  for (const algorithm of ALGORITHMS) {
    it(`removes ${algorithm} encryption with the open password`, async () => {
      const locked = await lockedPdf(algorithm, 'secret');
      expect(looksEncrypted(locked)).toBe(true);
      await expect(unlockPdf(locked, 'wrong')).rejects.toBeInstanceOf(WrongPasswordError);
      await expect(unlockPdf(locked, '')).rejects.toBeInstanceOf(WrongPasswordError);
      const open = await unlockPdf(locked, 'secret');
      expect(looksEncrypted(open)).toBe(false);
      expect(latin1(open)).not.toMatch(/\/Encrypt(?![A-Za-z])/);
      // An ordinary PDF library, which refuses encrypted files, now reads it.
      expect((await Plain.load(open)).getPageCount()).toBe(2);
    });

    it(`lifts ${algorithm} print and copy restrictions without any password`, async () => {
      const restricted = await lockedPdf(algorithm, '');
      const open = await unlockPdf(restricted, '');
      expect(looksEncrypted(open)).toBe(false);
      expect((await Plain.load(open)).getPageCount()).toBe(2);
    });
  }
});
