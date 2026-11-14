import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';

/**
 * File-level tools that do not depend on the editor: page ranges, a ZIP writer, building
 * a PDF from pictures, removing / adding a password and shrinking the pictures of a PDF.
 * Everything runs on this device.
 */

/** "1-3, 5, 8-" -> zero-based page indexes in the order given. Null when the text is not a valid range. */
export function parsePageRanges(text: string, pageCount: number): number[] | null {
  const out: number[] = [];
  const parts = text.split(/[,;\s]+/).filter(Boolean);
  if (!parts.length) return null;
  for (const part of parts) {
    const m = /^(\d+)?(?:\s*(-)\s*(\d+)?)?$/.exec(part);
    if (!m || (!m[1] && !m[2])) return null;
    const from = m[1] ? Number(m[1]) : 1;
    const to = m[2] ? (m[3] ? Number(m[3]) : pageCount) : from;
    if (from < 1 || to < 1 || from > pageCount || to > pageCount) return null;
    const step = to >= from ? 1 : -1;
    for (let p = from; p !== to + step; p += step) out.push(p - 1);
  }
  return out;
}

// ---- ZIP (stored, no compression: the pictures inside are already compressed) -------------------

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function zipStore(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // names are UTF-8
    local.setUint32(14, crc, true);
    local.setUint32(18, f.bytes.length, true);
    local.setUint32(22, f.bytes.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, f.bytes);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, f.bytes.length, true);
    dir.setUint32(24, f.bytes.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + f.bytes.length;
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

// ---- pictures -> PDF ----------------------------------------------------------------------------

export interface PictureInput {
  bytes: Uint8Array;
  mime: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
}

/** One page per picture. The picture fills its page; pages are at most A4 in size. */
export async function imagesToPdf(pictures: PictureInput[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const pic of pictures) {
    const image = pic.mime === 'image/png' ? await doc.embedPng(pic.bytes) : await doc.embedJpg(pic.bytes);
    const landscape = pic.width > pic.height;
    const [maxW, maxH] = landscape ? [842, 595] : [595, 842];
    const scale = Math.min(maxW / pic.width, maxH / pic.height);
    const w = pic.width * scale;
    const h = pic.height * scale;
    doc.addPage([w, h]).drawImage(image, { x: 0, y: 0, width: w, height: h });
  }
  return doc.save();
}

// ---- passwords ----------------------------------------------------------------------------------

/** True when the file says it is encrypted (it has an /Encrypt entry). */
export function looksEncrypted(bytes: Uint8Array): boolean {
  // The entry sits in the trailer or the cross-reference stream, both near the end of the file;
  // linearised files also carry one near the start.
  const scan = (from: number, to: number) => {
    const part = bytes.subarray(Math.max(0, from), Math.min(bytes.length, to));
    let s = '';
    for (let i = 0; i < part.length; i += 8192) s += String.fromCharCode(...part.subarray(i, i + 8192));
    // The trailer key itself, not a longer name such as /EncryptMetadata.
    return /\/Encrypt(?![A-Za-z])/.test(s);
  };
  return scan(bytes.length - 4096, bytes.length) || scan(0, 4096) || (bytes.length < 20_000_000 && scan(0, bytes.length));
}

export class WrongPasswordError extends Error {}

/**
 * Returns an unprotected copy of an encrypted PDF. `password` may be empty for files that
 * only restrict editing or printing. Throws WrongPasswordError when the password does not open it.
 */
export async function unlockPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const lib = await import('@cantoo/pdf-lib');
  let doc;
  try {
    doc = await lib.PDFDocument.load(bytes, { password, updateMetadata: false });
  } catch (e: any) {
    if (/password|decrypt|encrypt/i.test(e?.message ?? '')) throw new WrongPasswordError('That password does not open this PDF.');
    throw e;
  }
  return doc.save();
}

/** Protects a PDF so that it only opens with the password. */
export async function lockPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const lib = await import('@cantoo/pdf-lib');
  const doc = await lib.PDFDocument.load(bytes, { updateMetadata: false });
  doc.encrypt({ userPassword: password, ownerPassword: password, permissions: { printing: 'highResolution', modifying: true, copying: true, annotating: true, fillingForms: true } });
  return doc.save();
}

// ---- compression --------------------------------------------------------------------------------

export interface CompressLevel {
  /** Longest side a picture may keep, in pixels. */
  maxSide: number;
  /** JPEG quality from 0 to 1. */
  quality: number;
}

export const COMPRESS_LEVELS: Record<'balanced' | 'small', CompressLevel> = {
  balanced: { maxSide: 1600, quality: 0.72 },
  small: { maxSide: 1000, quality: 0.55 },
};

/** Re-encodes one JPEG smaller; returns null to keep the original. Supplied by the browser (canvas). */
export type Recoder = (jpeg: Uint8Array, level: CompressLevel) => Promise<{ bytes: Uint8Array; width: number; height: number } | null>;

export interface CompressResult {
  bytes: Uint8Array;
  /** Pictures made smaller / pictures looked at. */
  shrunk: number;
  candidates: number;
}

/**
 * Makes a PDF smaller by re-encoding its photos (JPEG pictures in RGB or grey) at a lower
 * resolution and quality. Other pictures, text and drawings are left exactly as they are.
 * A picture is only replaced when the new version really is smaller.
 */
export async function compressPdfImages(bytes: Uint8Array, level: CompressLevel, recode: Recoder): Promise<CompressResult> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const name = (s: string) => PDFName.of(s);
  let shrunk = 0;
  let candidates = 0;
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (d.get(name('Subtype')) !== name('Image') || d.get(name('Filter')) !== name('DCTDecode')) continue;
    // CMYK photos, masks and pictures with special decoding are not safe to redraw through a canvas.
    const cs = d.get(name('ColorSpace'));
    if ((cs !== name('DeviceRGB') && cs !== name('DeviceGray')) || d.has(name('Decode')) || d.has(name('DecodeParms')) || d.get(name('ImageMask'))) continue;
    candidates++;
    const next = await recode(obj.contents, level).catch(() => null);
    if (!next || next.bytes.length >= obj.contents.length * 0.92) continue;
    const dict = d.clone(doc.context);
    dict.set(name('Width'), PDFNumber.of(next.width));
    dict.set(name('Height'), PDFNumber.of(next.height));
    dict.set(name('BitsPerComponent'), PDFNumber.of(8));
    dict.set(name('ColorSpace'), name('DeviceRGB'));
    dict.set(name('Length'), PDFNumber.of(next.bytes.length));
    doc.context.assign(ref, PDFRawStream.of(dict, next.bytes));
    shrunk++;
  }
  if (!shrunk) return { bytes, shrunk, candidates };
  return { bytes: await doc.save(), shrunk, candidates };
}
