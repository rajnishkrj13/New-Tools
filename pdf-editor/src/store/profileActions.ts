import type { EditorObject, ImageAsset, MarkObject, TextObject } from '../types/objects';
import { EMPTY_DETAILS, EMPTY_PROFILE, formatDate, matchDetailsToFields, type DateFormat, type Details, type Placement, type Profile, type SavedMark, type SavedMarkKind } from '../engines/Profile';
import { findFormFields } from '../engines/PdfRenderer';
import { measureText, BASELINE_EM } from '../utils/fontUtils';
import { newId } from '../utils/imageUtils';
import { profileClear, profileGet, profilePut } from '../utils/profileStore';
import { getState, useEditorStore } from './documentStore';

/**
 * Daily helpers: saved signatures and initials, today's date, tick and cross marks and your
 * saved details. Choosing one "arms" the Place tool; each click on a page puts it there.
 */

export type { Placement, Profile };

// ---- the stored profile ------------------------------------------------------------------------

export async function loadProfile() {
  try {
    const [marks, details, dateFormat] = await Promise.all([
      profileGet<SavedMark[]>('marks'),
      profileGet<Details>('details'),
      profileGet<DateFormat>('dateFormat'),
    ]);
    useEditorStore.setState({
      profile: { loaded: true, marks: marks ?? [], details: { ...EMPTY_DETAILS, ...(details ?? {}) }, dateFormat: dateFormat ?? 'dmy-slash' },
    });
  } catch {
    useEditorStore.setState((s) => ({ profile: { ...s.profile, loaded: true } }));
  }
}

async function persist(key: 'marks' | 'details' | 'dateFormat', value: unknown) {
  try {
    await profilePut(key, value);
  } catch {
    getState().toast('This browser would not save it, so it is kept only until you close the tab.', 'warning');
  }
}

export async function saveMark(kind: SavedMarkKind, png: Uint8Array, width: number, height: number, mime: 'image/png' | 'image/jpeg' = 'image/png'): Promise<SavedMark> {
  const mark: SavedMark = { id: newId(), kind, png, width, height, created: Date.now(), mime };
  const marks = [mark, ...getState().profile.marks];
  useEditorStore.setState((s) => ({ profile: { ...s.profile, marks } }));
  await persist('marks', marks);
  return mark;
}

export async function deleteMark(id: string) {
  const marks = getState().profile.marks.filter((m) => m.id !== id);
  useEditorStore.setState((s) => ({ profile: { ...s.profile, marks } }));
  await persist('marks', marks);
}

export async function saveDetails(details: Details) {
  useEditorStore.setState((s) => ({ profile: { ...s.profile, details } }));
  await persist('details', details);
}

export async function setDateFormat(dateFormat: DateFormat) {
  useEditorStore.setState((s) => ({ profile: { ...s.profile, dateFormat } }));
  await persist('dateFormat', dateFormat);
}

export async function forgetEverything() {
  useEditorStore.setState({ profile: { ...EMPTY_PROFILE, loaded: true } });
  await profileClear().catch(() => undefined);
}

// ---- placing -------------------------------------------------------------------------------------

export function startPlacing(placement: Placement) {
  const s = getState();
  if (!s.doc) return;
  s.setTool('place');
  useEditorStore.setState({ placing: placement });
}

/** Turns a saved signature into a picture of this document and arms placing it. */
export function placeSavedMark(mark: SavedMark) {
  const s = getState();
  const mime = mark.mime ?? 'image/png';
  const url = URL.createObjectURL(new Blob([mark.png.slice().buffer], { type: mime }));
  const asset: ImageAsset = { id: newId(), name: `${mark.kind}.png`, mime, bytes: mark.png, url, width: mark.width, height: mark.height };
  s.addAsset(asset);
  // Drawn at three times screen size; a signature is about 160 pt wide at most, initials 70 pt.
  const max = mark.kind === 'initials' ? { w: 70, h: 40 } : { w: 160, h: 70 };
  const scale = Math.min(max.w / (mark.width / 3), max.h / (mark.height / 3), 1) / 3;
  startPlacing({
    kind: 'image', label: mark.kind === 'initials' ? 'your initials' : 'your signature', repeat: mark.kind === 'initials',
    assetId: asset.id, width: mark.width * scale, height: mark.height * scale,
  });
}

export function placeToday() {
  const text = formatDate(new Date(), getState().profile.dateFormat);
  startPlacing({ kind: 'text', label: `the date (${text})`, repeat: true, text });
}

export function placeMark(mark: MarkObject['mark']) {
  startPlacing({ kind: 'mark', label: mark === 'check' ? 'a tick' : mark === 'cross' ? 'a cross' : 'a dot', repeat: true, mark });
}

export function placeDetail(label: string, value: string) {
  startPlacing({ kind: 'text', label: label.toLowerCase(), repeat: false, text: value });
}

/** Puts the armed item on a page, centred on the point that was clicked (view space). */
export function placeAt(pageIndex: number, x: number, y: number) {
  const s = getState();
  const p = s.placing;
  const page = s.pages[pageIndex];
  if (!p || !page) return;
  let obj: EditorObject;
  const base = { id: newId(), pageIndex };
  if (p.kind === 'image') {
    obj = { ...base, type: 'image', x: x - p.width / 2, y: y - p.height / 2, width: p.width, height: p.height, rotation: 0, opacity: 1, assetId: p.assetId, keepRatio: true, signature: true };
  } else if (p.kind === 'mark') {
    const size = 12;
    obj = { ...base, type: 'mark', mark: p.mark, x: x - size / 2, y: y - size / 2, width: size, height: size, color: p.mark === 'cross' ? '#b91c1c' : '#111827', strokeWidth: 1.6, opacity: 1 };
  } else {
    const style = { ...s.toolStyle.text, align: 'left' as const };
    const lines = p.text.split('\n');
    const width = Math.min(page.width - 8, Math.max(...lines.map((l) => measureText(l, style))) + 6);
    // The click marks where the text sits on the line: the baseline goes a little below it.
    const box: TextObject = { ...base, type: 'text', ...style, text: p.text, rotation: 0, width, x: x - 2, y: y - style.fontSize * BASELINE_EM * 0.7 };
    obj = box;
  }
  if (p.repeat) s.addObject(obj, false);
  else {
    s.addObject(obj);
    s.setTool('select');
    getState().select(obj.id);
  }
}

// ---- forms ---------------------------------------------------------------------------------------

/**
 * Fills the form fields the document already has from your saved details, judged by field
 * names. Fields that already have a value are left alone. Returns how many were filled.
 */
export async function fillFormFromDetails(): Promise<number> {
  const s = getState();
  const details = s.profile.details;
  const fields = (await Promise.all(s.pages.map((p) => findFormFields(p)))).flat();
  if (!fields.length) {
    s.toast('This document has no fillable fields. Click one of your details in the list, then click on the page to place it.', 'info');
    return 0;
  }
  const current = getState().formValues;
  const empty = fields.filter((f) => !f.readOnly && f.kind === 'text' && !String(current[f.name] ?? f.value ?? '').trim());
  const matches = matchDetailsToFields(empty.map((f) => ({ name: f.name, kind: f.kind })), details);
  const names = Object.keys(matches);
  for (const name of names) getState().setFormValue(name, matches[name]);
  if (!names.length) {
    s.toast('None of the empty fields matched your saved details. Fill them by hand, or add the missing details under "Edit my details".', 'info');
  } else {
    s.toast(`Filled ${names.length} field${names.length > 1 ? 's' : ''} from your details. Check them before you download: matching is by field name.`, 'success');
  }
  return names.length;
}
