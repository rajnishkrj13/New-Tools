import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFStream, type PDFObject } from 'pdf-lib';

/**
 * Privacy work on the file itself: removing what a PDF carries besides what you see
 * (properties, attachments, scripts, comments, bookmarks, thumbnails), editing the
 * document properties, and - most important - making sure that content which was
 * removed from a page is really gone from the saved bytes and not just unreachable.
 */

export interface DocProps {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
}

export const EMPTY_PROPS: DocProps = { title: '', author: '', subject: '', keywords: '', creator: '', producer: '' };

export interface CleanOptions {
  /** Title, author, dates, custom entries and the XMP copy of them. */
  properties: boolean;
  /** Files embedded in the document and file-attachment comments. */
  attachments: boolean;
  /** JavaScript and automatic actions. */
  scripts: boolean;
  /** Comments, notes, markup and pop-ups that the document already has (links and form fields stay). */
  comments: boolean;
  /** Bookmarks (the outline). */
  bookmarks: boolean;
  /** Page thumbnails and data other applications left in the file. */
  privateData: boolean;
}

export const NO_CLEANING: CleanOptions = { properties: false, attachments: false, scripts: false, comments: false, bookmarks: false, privateData: false };
export const ALL_CLEANING: CleanOptions = { properties: true, attachments: true, scripts: true, comments: true, bookmarks: true, privateData: true };
export const anyCleaning = (c: CleanOptions | undefined): boolean => !!c && Object.values(c).some(Boolean);

const N = (s: string) => PDFName.of(s);

/**
 * Deletes every object of the file that cannot be reached from the document any more.
 * pdf-lib writes all objects it holds, so without this a removed page, a flattened page
 * or a removed attachment would still be inside the saved file (invisible, but readable
 * by anyone who looks at the bytes). Returns how many objects were dropped.
 */
export function pruneUnreachable(doc: PDFDocument): number {
  const ctx = doc.context;
  const seen = new Set<string>();
  const stack: PDFObject[] = [];
  const trailer = ctx.trailerInfo;
  for (const root of [trailer.Root, trailer.Info, trailer.Encrypt]) if (root) stack.push(root);
  while (stack.length) {
    const o = stack.pop()!;
    if (o instanceof PDFRef) {
      if (seen.has(o.tag)) continue;
      seen.add(o.tag);
      const target = ctx.lookup(o);
      if (target) stack.push(target);
    } else if (o instanceof PDFDict) {
      for (const v of o.values()) stack.push(v);
    } else if (o instanceof PDFArray) {
      for (const v of o.asArray()) stack.push(v);
    } else if (o instanceof PDFStream) {
      stack.push(o.dict);
    }
  }
  let dropped = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!seen.has(ref.tag)) {
      ctx.delete(ref);
      dropped++;
    }
  }
  return dropped;
}

/**
 * Points everything that referred to a page that is being replaced (bookmarks, links,
 * named destinations, the structure tree) at its replacement. Left alone, such a reference
 * would keep the old page - its text, pictures and form values - alive inside the file.
 */
export function redirectReferences(doc: PDFDocument, from: PDFRef, to: PDFRef): void {
  const swap = (v: PDFObject): PDFObject => (v instanceof PDFRef && v.tag === from.tag ? to : v);
  const walk = (obj: PDFObject): void => {
    if (obj instanceof PDFDict) {
      for (const [key, value] of obj.entries()) {
        const next = swap(value);
        if (next !== value) obj.set(key, next);
        else walk(value);
      }
    } else if (obj instanceof PDFArray) {
      for (let i = 0; i < obj.size(); i++) {
        const value = obj.get(i);
        const next = swap(value);
        if (next !== value) obj.set(i, next);
        else walk(value);
      }
    }
  };
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (ref.tag === from.tag) continue; // the old page itself
    walk(obj instanceof PDFStream ? obj.dict : obj);
  }
}

/** Drops the accessibility tags: they carry the alternative text of content that may be redacted. */
export function dropStructureTree(doc: PDFDocument): boolean {
  const had = doc.catalog.has(N('StructTreeRoot'));
  doc.catalog.delete(N('StructTreeRoot'));
  doc.catalog.delete(N('MarkInfo'));
  return had;
}

/** References of the annotations (form widgets among them) of a page. */
export function annotationRefs(doc: PDFDocument, pageNode: { Annots(): PDFArray | undefined }): string[] {
  void doc;
  return (pageNode.Annots()?.asArray() ?? []).filter((r): r is PDFRef => r instanceof PDFRef).map((r) => r.tag);
}

/**
 * Takes form fields out of the AcroForm when their widgets were on pages that are gone.
 * Otherwise the form would keep pointing at them, with the values that were typed in.
 */
export function dropFieldsOfRemovedPages(doc: PDFDocument, removedAnnotations: Set<string>): void {
  if (!removedAnnotations.size) return;
  const ctx = doc.context;
  const acro = doc.catalog.lookupMaybe(N('AcroForm'), PDFDict);
  const fields = acro?.lookupMaybe(N('Fields'), PDFArray);
  if (!acro || !fields) return;
  const keep = (ref: PDFRef): boolean => {
    const dict = ctx.lookupMaybe(ref, PDFDict);
    if (!dict) return false;
    if (removedAnnotations.has(ref.tag)) return false;
    const kids = dict.lookupMaybe(N('Kids'), PDFArray);
    if (!kids) return true;
    const kept = kids.asArray().filter((k): k is PDFRef => k instanceof PDFRef && keep(k));
    if (!kept.length) return false;
    dict.set(N('Kids'), ctx.obj(kept));
    return true;
  };
  const kept = fields.asArray().filter((r): r is PDFRef => r instanceof PDFRef && keep(r));
  acro.set(N('Fields'), ctx.obj(kept));
}

const isJavaScriptAction = (action: PDFObject | undefined, doc: PDFDocument) => {
  const dict = action && doc.context.lookupMaybe(action, PDFDict);
  return !!dict && doc.context.lookup(dict.get(N('S'))) === N('JavaScript');
};

/** Walks the form's field tree, calling `fn` for every field and widget dictionary. */
function walkFields(doc: PDFDocument, fn: (dict: PDFDict) => void) {
  const acro = doc.catalog.lookupMaybe(N('AcroForm'), PDFDict);
  const seen = new Set<PDFDict>();
  const visit = (obj: PDFObject | undefined) => {
    const dict = obj && doc.context.lookupMaybe(obj, PDFDict);
    if (!dict || seen.has(dict)) return;
    seen.add(dict);
    fn(dict);
    for (const kid of dict.lookupMaybe(N('Kids'), PDFArray)?.asArray() ?? []) visit(kid);
  };
  for (const f of acro?.lookupMaybe(N('Fields'), PDFArray)?.asArray() ?? []) visit(f);
}

/**
 * Removes the chosen kinds of hidden data from the document as it was opened. Run it before
 * adding your own edits, so what you add yourself (a comment, a link) is kept. Returns a
 * line for everything that was actually found and removed.
 */
export interface Found {
  key: keyof CleanOptions;
  label: string;
}

export function sanitizeOriginal(doc: PDFDocument, clean: CleanOptions): Found[] {
  const ctx = doc.context;
  const catalog = doc.catalog;
  const notes: Found[] = [];
  const pages = doc.getPages();

  if (clean.properties) {
    const info = ctx.lookupMaybe(ctx.trailerInfo.Info, PDFDict);
    const keys = info ? [...info.keys()] : [];
    for (const k of keys) info!.delete(k);
    const hadXmp = catalog.has(N('Metadata'));
    catalog.delete(N('Metadata'));
    for (const p of pages) p.node.delete(N('Metadata'));
    if (keys.length || hadXmp) notes.push({ key: 'properties', label: 'Document properties and metadata' });
  }

  if (clean.attachments) {
    let found = false;
    const names = catalog.lookupMaybe(N('Names'), PDFDict);
    if (names?.has(N('EmbeddedFiles'))) {
      names.delete(N('EmbeddedFiles'));
      found = true;
    }
    if (catalog.has(N('AF'))) {
      catalog.delete(N('AF'));
      found = true;
    }
    for (const p of pages) {
      p.node.delete(N('AF'));
      const annots = p.node.Annots();
      if (!annots) continue;
      const keep = annots.asArray().filter((a) => {
        const d = ctx.lookupMaybe(a, PDFDict);
        const attachment = d && ctx.lookup(d.get(N('Subtype'))) === N('FileAttachment');
        if (attachment) found = true;
        return !attachment;
      });
      if (keep.length !== annots.size()) p.node.set(N('Annots'), ctx.obj(keep));
    }
    if (found) notes.push({ key: 'attachments', label: 'Attached files' });
  }

  if (clean.scripts) {
    let found = false;
    const names = catalog.lookupMaybe(N('Names'), PDFDict);
    if (names?.has(N('JavaScript'))) {
      names.delete(N('JavaScript'));
      found = true;
    }
    if (isJavaScriptAction(catalog.get(N('OpenAction')), doc)) {
      catalog.delete(N('OpenAction'));
      found = true;
    }
    if (catalog.has(N('AA'))) {
      catalog.delete(N('AA'));
      found = true;
    }
    const strip = (d: PDFDict) => {
      if (d.has(N('AA'))) {
        d.delete(N('AA'));
        found = true;
      }
      if (isJavaScriptAction(d.get(N('A')), doc)) {
        d.delete(N('A'));
        found = true;
      }
    };
    for (const p of pages) {
      strip(p.node);
      for (const a of p.node.Annots()?.asArray() ?? []) {
        const d = ctx.lookupMaybe(a, PDFDict);
        if (d) strip(d);
      }
    }
    walkFields(doc, strip);
    if (found) notes.push({ key: 'scripts', label: 'Scripts and automatic actions' });
  }

  if (clean.comments) {
    let count = 0;
    for (const p of pages) {
      const annots = p.node.Annots();
      if (!annots) continue;
      const keep = annots.asArray().filter((a) => {
        const d = ctx.lookupMaybe(a, PDFDict);
        const subtype = d && ctx.lookup(d.get(N('Subtype')));
        const stays = !d || subtype === N('Link') || subtype === N('Widget');
        if (!stays) count++;
        return stays;
      });
      if (keep.length !== annots.size()) p.node.set(N('Annots'), ctx.obj(keep));
    }
    if (count) notes.push({ key: 'comments', label: `${count} comment${count > 1 ? 's' : ''} and markup` });
  }

  if (clean.bookmarks && catalog.has(N('Outlines'))) {
    catalog.delete(N('Outlines'));
    notes.push({ key: 'bookmarks', label: 'Bookmarks' });
  }

  if (clean.privateData) {
    let found = false;
    for (const d of [catalog, ...pages.map((p) => p.node)]) {
      for (const key of ['PieceInfo', 'Thumb']) {
        if (d.has(N(key))) {
          d.delete(N(key));
          found = true;
        }
      }
    }
    if (found) notes.push({ key: 'privateData', label: 'Thumbnails and data left by other programs' });
  }
  return notes;
}

/** Sets the document properties. Empty fields are removed. The XMP copy is dropped so it cannot contradict them. */
export function applyProperties(doc: PDFDocument, props: DocProps): string[] {
  const ctx = doc.context;
  let info = ctx.lookupMaybe(ctx.trailerInfo.Info, PDFDict);
  if (!info) {
    info = ctx.obj({});
    ctx.trailerInfo.Info = ctx.register(info);
  }
  const entries: [keyof DocProps, string][] = [
    ['title', 'Title'], ['author', 'Author'], ['subject', 'Subject'], ['keywords', 'Keywords'], ['creator', 'Creator'], ['producer', 'Producer'],
  ];
  for (const [field, key] of entries) {
    const value = props[field].trim();
    if (value) info.set(N(key), PDFHexString.fromText(value));
    else info.delete(N(key));
  }
  doc.catalog.delete(N('Metadata'));
  return ['Document properties changed'];
}

/** What the file carries besides what you see, found without changing it. */
export async function inspectHiddenData(bytes: Uint8Array): Promise<Found[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return sanitizeOriginal(doc, ALL_CLEANING);
}
