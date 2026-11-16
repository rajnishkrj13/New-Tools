import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFStream, PDFString, decodePDFRawStream } from 'pdf-lib';

/** Writes hex strings such as <48656c6c6f> out as readable text, next to the original. */
const withHexDecoded = (s: string) =>
  `${s}\n${s.replace(/<([0-9A-Fa-f\s]{4,})>/g, (_m, h: string) => {
    const hex = h.replace(/\s+/g, '');
    let out = '';
    for (let i = 0; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    return out;
  })}`;

/**
 * Everything a PDF file really contains, as text: every object, whether or not a page can
 * reach it, with streams decoded. Used to prove that removed content is gone from the bytes,
 * not just hidden from viewers.
 */
export async function everythingIn(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  const parts: string[] = [];
  const text = (obj: unknown): string => {
    if (obj instanceof PDFString || obj instanceof PDFHexString) return `${obj.decodeText()} `;
    if (obj instanceof PDFDict) return [...obj.entries()].map(([k, v]) => `${k} ${text(v)}`).join(' ');
    if (obj instanceof PDFArray) return obj.asArray().map(text).join(' ');
    return String(obj);
  };
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      parts.push(text(obj.dict));
      try {
        parts.push(new TextDecoder('latin1').decode(decodePDFRawStream(obj).decode()));
      } catch {
        parts.push(new TextDecoder('latin1').decode(obj.contents));
      }
    } else if (obj instanceof PDFStream) {
      parts.push(text(obj.dict), new TextDecoder('latin1').decode(obj.getContents()));
    } else parts.push(text(obj));
  }
  // The raw bytes too, for anything stored outside the object structure.
  parts.push(new TextDecoder('latin1').decode(bytes));
  return withHexDecoded(parts.join('\n'));
}

export const hasName = (dict: PDFDict | undefined, key: string) => !!dict?.has(PDFName.of(key));
