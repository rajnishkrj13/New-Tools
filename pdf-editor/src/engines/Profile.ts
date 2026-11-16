/**
 * Things you reuse every day: saved signatures and initials, your details for forms, and
 * how dates are written. Kept on this device only (see utils/profileStore).
 */

export type SavedMarkKind = 'signature' | 'initials';

export interface SavedMark {
  id: string;
  kind: SavedMarkKind;
  /** Picture of the drawn (transparent PNG) or uploaded signature. */
  png: Uint8Array;
  mime?: 'image/png' | 'image/jpeg';
  /** Size of the picture in pixels. */
  width: number;
  height: number;
  created: number;
}

export interface Details {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  city: string;
  postcode: string;
  country: string;
  /** Anything else you fill in often, such as a customer number. */
  custom: { label: string; value: string }[];
}

export const EMPTY_DETAILS: Details = { fullName: '', email: '', phone: '', company: '', address: '', city: '', postcode: '', country: '', custom: [] };

export const DETAIL_FIELDS: { key: Exclude<keyof Details, 'custom'>; label: string; multiline?: boolean }[] = [
  { key: 'fullName', label: 'Full name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'address', label: 'Address', multiline: true },
  { key: 'city', label: 'City' },
  { key: 'postcode', label: 'PIN / postcode' },
  { key: 'country', label: 'Country' },
];

/** Every detail that has a value, with its label, in the order shown to the user. */
export function detailEntries(d: Details): { label: string; value: string }[] {
  return [
    ...DETAIL_FIELDS.map((f) => ({ label: f.label, value: d[f.key].trim() })),
    ...d.custom.map((c) => ({ label: c.label.trim() || 'Other', value: c.value.trim() })),
  ].filter((e) => e.value);
}

// ---- dates -------------------------------------------------------------------------------------

export type DateFormat = 'dmy-slash' | 'dmy-dash' | 'dmy-long' | 'mdy-long' | 'iso';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const two = (n: number) => String(n).padStart(2, '0');

export function formatDate(d: Date, f: DateFormat): string {
  const day = d.getDate();
  const month = d.getMonth();
  const year = d.getFullYear();
  switch (f) {
    case 'dmy-dash':
      return `${two(day)}-${two(month + 1)}-${year}`;
    case 'dmy-long':
      return `${day} ${MONTHS[month]} ${year}`;
    case 'mdy-long':
      return `${MONTHS[month]} ${day}, ${year}`;
    case 'iso':
      return `${year}-${two(month + 1)}-${two(day)}`;
    default:
      return `${two(day)}/${two(month + 1)}/${year}`;
  }
}

export const DATE_FORMATS: DateFormat[] = ['dmy-slash', 'dmy-dash', 'dmy-long', 'mdy-long', 'iso'];

// ---- matching details to form fields ----------------------------------------------------------------

/** "topmostSubform[0].Page1[0].FirstName[0]" -> "first name" */
export function plainFieldName(name: string): string {
  return (name.split('.').pop() ?? name)
    .replace(/\[\d+\]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Names of other people or things: a "name" field like these is not yours. */
const NOT_YOUR_NAME = /\b(father|mother|spouse|husband|wife|nominee|guardian|parent|child|bank|branch|account|file|user|login|product|item|project|street|city|town|state|country|company|business|employer|firm|organi[sz]ation|witness|agent|doctor|school|college|beneficiary|holder|emergency)s?\b/;

/**
 * Which of your saved details belongs in which form field, judged by the field's name.
 * Only text fields are filled; fields whose name gives no clear answer are left alone.
 */
export function matchDetailsToFields(fields: { name: string; kind: string }[], d: Details): Record<string, string> {
  const out: Record<string, string> = {};
  const [first, ...rest] = d.fullName.trim().split(/\s+/);
  const last = rest.join(' ');
  for (const f of fields) {
    if (f.kind !== 'text') continue;
    const n = plainFieldName(f.name);
    let value = '';
    if (/\be ?mail\b|\bemail/.test(n)) value = d.email;
    else if (/\b(phone|mobile|tel|telephone|cell|contact (no|number))\b/.test(n)) value = d.phone;
    else if (/\b(first|given|fore) ?name\b|\bfname\b|\bforename\b/.test(n)) value = first ?? '';
    else if (/\b(last|family|sur) ?name\b|\blname\b|\bsurname\b/.test(n)) value = last;
    else if (/\b(company|organi[sz]ation|business|employer|firm)\b/.test(n)) value = d.company;
    else if (/\b(post ?code|postal|zip|pin ?code|pincode)\b|^pin$/.test(n)) value = d.postcode;
    else if (/\b(city|town)\b/.test(n)) value = d.city;
    else if (/\bcountry\b/.test(n)) value = d.country;
    else if (/\b(address|addr|street|residence)\b/.test(n) && !/\b(line ?2|address ?2|2)\b/.test(n)) value = d.address.replace(/\s*\n\s*/g, ', ');
    else if (/\bname\b/.test(n) && !NOT_YOUR_NAME.test(n)) value = d.fullName;
    else {
      const custom = d.custom.find((c) => {
        const label = plainFieldName(c.label);
        return label.length > 2 && (n === label || n.includes(label) || label.includes(n));
      });
      if (custom) value = custom.value;
    }
    if (value.trim()) out[f.name] = value.trim();
  }
  return out;
}

// ---- state shared with the editor store --------------------------------------------------------

/** The item the Place tool puts down on every click. */
export type Placement =
  | { kind: 'image'; label: string; repeat: boolean; assetId: string; width: number; height: number }
  | { kind: 'text'; label: string; repeat: boolean; text: string }
  | { kind: 'mark'; label: string; repeat: true; mark: 'check' | 'cross' | 'dot' };

export interface Profile {
  loaded: boolean;
  marks: SavedMark[];
  details: Details;
  dateFormat: DateFormat;
}

export const EMPTY_PROFILE: Profile = { loaded: false, marks: [], details: EMPTY_DETAILS, dateFormat: 'dmy-slash' };
