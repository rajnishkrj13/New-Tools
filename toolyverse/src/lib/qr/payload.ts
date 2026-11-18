/**
 * What goes inside a QR code for each kind of code. Phones only act on a few well-known
 * formats (a link, WIFI:, BEGIN:VCARD, mailto:, tel:, SMSTO:, BEGIN:VEVENT, upi://), so each
 * type turns its form into exactly one of those, and says in plain words what is wrong when
 * the form is not filled in correctly. Plain data: used by the tool and by the tests.
 */

export type QrType =
  | 'url'
  | 'text'
  | 'wifi'
  | 'vcard'
  | 'business'
  | 'email'
  | 'phone'
  | 'sms'
  | 'whatsapp'
  | 'location'
  | 'event'
  | 'upi'
  | 'review'
  | 'social'
  | 'youtube'
  | 'instagram'
  | 'facebook'
  | 'linkedin'
  | 'pdf'
  | 'app';

export type Fields = Record<string, string>;

export interface FieldDef {
  key: string;
  label: string;
  kind?: 'text' | 'textarea' | 'select' | 'datetime' | 'password' | 'checkbox';
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  /** Shown on the same row as the next field on wide screens. */
  half?: boolean;
  inputMode?: 'url' | 'email' | 'tel' | 'numeric' | 'decimal' | 'text';
}

export interface TypeDef {
  value: QrType;
  label: string;
  /** One line under the form: what the person scanning will see. */
  scans: string;
  fields: FieldDef[];
  /** What the form starts with. */
  initial: Fields;
}

export const SOCIAL = {
  instagram: { label: 'Instagram', base: 'https://www.instagram.com/', host: 'instagram.com' },
  facebook: { label: 'Facebook', base: 'https://www.facebook.com/', host: 'facebook.com' },
  youtube: { label: 'YouTube', base: 'https://www.youtube.com/@', host: 'youtube.com' },
  linkedin: { label: 'LinkedIn', base: 'https://www.linkedin.com/in/', host: 'linkedin.com' },
  x: { label: 'X (Twitter)', base: 'https://x.com/', host: 'x.com' },
  telegram: { label: 'Telegram', base: 'https://t.me/', host: 't.me' },
} as const;
type Platform = keyof typeof SOCIAL;

const handleField = (label: string, placeholder: string): FieldDef => ({ key: 'handle', label, placeholder, hint: 'A username, or paste the full link to the profile, page or video.' });

export const TYPES: TypeDef[] = [
  { value: 'url', label: 'Website', scans: 'Opens the web page.', fields: [{ key: 'url', label: 'Website link', placeholder: 'https://example.com', inputMode: 'url' }], initial: { url: '' } },
  { value: 'text', label: 'Text', scans: 'Shows the text on the phone.', fields: [{ key: 'text', label: 'Text', kind: 'textarea', placeholder: 'Any message, code or note' }], initial: { text: '' } },
  {
    value: 'wifi',
    label: 'WiFi',
    scans: 'Offers to join the network, without typing the password.',
    fields: [
      { key: 'ssid', label: 'Network name (SSID)', placeholder: 'Home-WiFi', half: true },
      { key: 'password', label: 'Password', kind: 'password', half: true },
      { key: 'security', label: 'Security', kind: 'select', options: [{ value: 'WPA', label: 'WPA / WPA2 / WPA3' }, { value: 'WEP', label: 'WEP (old routers)' }, { value: 'nopass', label: 'No password' }], half: true },
      { key: 'hidden', label: 'Hidden network', kind: 'checkbox', half: true },
    ],
    initial: { ssid: '', password: '', security: 'WPA', hidden: '' },
  },
  {
    value: 'vcard',
    label: 'Contact (vCard)',
    scans: 'Offers to save the contact to the phone.',
    fields: [
      { key: 'first', label: 'First name', half: true },
      { key: 'last', label: 'Last name', half: true },
      { key: 'phone', label: 'Mobile', inputMode: 'tel', placeholder: '+91 98765 43210', half: true },
      { key: 'email', label: 'Email', inputMode: 'email', half: true },
      { key: 'org', label: 'Company', half: true },
      { key: 'title', label: 'Job title', half: true },
      { key: 'website', label: 'Website', inputMode: 'url' },
      { key: 'address', label: 'Address', placeholder: 'Street, city, PIN' },
    ],
    initial: { first: '', last: '', phone: '', email: '', org: '', title: '', website: '', address: '' },
  },
  {
    value: 'business',
    label: 'Business',
    scans: 'Saves your business as a contact: name, phone, email, website and address.',
    fields: [
      { key: 'org', label: 'Business name' },
      { key: 'phone', label: 'Phone', inputMode: 'tel', half: true },
      { key: 'email', label: 'Email', inputMode: 'email', half: true },
      { key: 'website', label: 'Website', inputMode: 'url', half: true },
      { key: 'person', label: 'Contact person', half: true },
      { key: 'address', label: 'Address', placeholder: 'Shop no., street, city, PIN' },
      { key: 'note', label: 'Hours or note', placeholder: 'Mon–Sat 10 am – 8 pm' },
    ],
    initial: { org: '', phone: '', email: '', website: '', person: '', address: '', note: '' },
  },
  {
    value: 'email',
    label: 'Email',
    scans: 'Opens a new email, ready to send.',
    fields: [
      { key: 'to', label: 'Email address', inputMode: 'email', placeholder: 'name@example.com' },
      { key: 'subject', label: 'Subject' },
      { key: 'body', label: 'Message', kind: 'textarea' },
    ],
    initial: { to: '', subject: '', body: '' },
  },
  { value: 'phone', label: 'Phone call', scans: 'Opens the dialler with the number.', fields: [{ key: 'phone', label: 'Phone number', inputMode: 'tel', placeholder: '+91 98765 43210', hint: 'Include the country code so it works for visitors from abroad.' }], initial: { phone: '' } },
  {
    value: 'sms',
    label: 'SMS',
    scans: 'Opens a text message to the number, with your message filled in.',
    fields: [
      { key: 'phone', label: 'Phone number', inputMode: 'tel', placeholder: '+91 98765 43210' },
      { key: 'message', label: 'Message', kind: 'textarea' },
    ],
    initial: { phone: '', message: '' },
  },
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    scans: 'Opens a WhatsApp chat with the number, with your message typed in.',
    fields: [
      { key: 'phone', label: 'WhatsApp number with country code', inputMode: 'tel', placeholder: '+91 98765 43210', hint: 'For India start with 91; spaces and + are fine.' },
      { key: 'message', label: 'Message (optional)', kind: 'textarea', placeholder: 'Hi, I would like to know more about…' },
    ],
    initial: { phone: '', message: '' },
  },
  {
    value: 'location',
    label: 'Location',
    scans: 'Opens the place in Google Maps (or the phone’s maps app).',
    fields: [
      { key: 'query', label: 'Address, place name or Google Maps link', placeholder: 'India Gate, New Delhi' },
      { key: 'lat', label: 'or latitude', inputMode: 'decimal', placeholder: '28.6129', half: true },
      { key: 'lng', label: 'longitude', inputMode: 'decimal', placeholder: '77.2295', half: true },
    ],
    initial: { query: '', lat: '', lng: '' },
  },
  {
    value: 'event',
    label: 'Event',
    scans: 'Offers to add the event to the calendar.',
    fields: [
      { key: 'title', label: 'Event name' },
      { key: 'start', label: 'Starts', kind: 'datetime', half: true },
      { key: 'end', label: 'Ends', kind: 'datetime', half: true },
      { key: 'place', label: 'Venue' },
      { key: 'details', label: 'Details', kind: 'textarea' },
    ],
    initial: { title: '', start: '', end: '', place: '', details: '' },
  },
  {
    value: 'upi',
    label: 'UPI payment',
    scans: 'Opens any UPI app (GPay, PhonePe, Paytm, BHIM) ready to pay you.',
    fields: [
      { key: 'vpa', label: 'UPI ID', placeholder: 'shopname@okaxis', hint: 'Find it in your UPI app under your profile.' },
      { key: 'name', label: 'Payee name', placeholder: 'As registered with the bank', half: true },
      { key: 'amount', label: 'Amount in ₹ (optional)', inputMode: 'decimal', placeholder: 'Leave empty to let the payer type it', half: true },
      { key: 'note', label: 'Note (optional)', placeholder: 'Order 1042' },
    ],
    initial: { vpa: '', name: '', amount: '', note: '' },
  },
  {
    value: 'review',
    label: 'Google review',
    scans: 'Opens the Google review box for your business.',
    fields: [{ key: 'link', label: 'Review link or Place ID', placeholder: 'https://g.page/r/…/review  or  ChIJ…', hint: 'In Google Business Profile choose “Ask for reviews” and copy the link; a Place ID also works.' }],
    initial: { link: '' },
  },
  {
    value: 'social',
    label: 'Social media',
    scans: 'Opens the profile in the app, or in the browser.',
    fields: [
      { key: 'platform', label: 'Platform', kind: 'select', options: Object.entries(SOCIAL).map(([value, s]) => ({ value, label: s.label })) },
      handleField('Username or link', 'yourname'),
    ],
    initial: { platform: 'instagram', handle: '' },
  },
  { value: 'youtube', label: 'YouTube', scans: 'Opens the channel or video in YouTube.', fields: [handleField('Channel handle or video link', '@yourchannel')], initial: { handle: '' } },
  { value: 'instagram', label: 'Instagram', scans: 'Opens the Instagram profile, ready to follow.', fields: [handleField('Instagram username or link', 'yourname')], initial: { handle: '' } },
  { value: 'facebook', label: 'Facebook', scans: 'Opens the Facebook page or profile.', fields: [handleField('Facebook page name or link', 'yourpage')], initial: { handle: '' } },
  { value: 'linkedin', label: 'LinkedIn', scans: 'Opens the LinkedIn profile or company page.', fields: [handleField('LinkedIn profile or company link', 'in/yourname  or  company/yourcompany')], initial: { handle: '' } },
  {
    value: 'pdf',
    label: 'PDF link',
    scans: 'Opens the PDF where you have put it online.',
    fields: [{ key: 'url', label: 'Link to the PDF', inputMode: 'url', placeholder: 'https://drive.google.com/file/d/…', hint: 'Upload the PDF to Google Drive, Dropbox or your website and paste its share link. In Drive set access to “Anyone with the link”.' }],
    initial: { url: '' },
  },
  {
    value: 'app',
    label: 'App download',
    scans: 'Opens the app’s store page.',
    fields: [
      { key: 'store', label: 'Store', kind: 'select', options: [{ value: 'play', label: 'Google Play' }, { value: 'apple', label: 'Apple App Store' }, { value: 'page', label: 'Both: my own download page' }] },
      { key: 'link', label: 'Store link or Android package name', placeholder: 'https://play.google.com/store/apps/details?id=…  or  com.example.app' },
    ],
    initial: { store: 'play', link: '' },
  },
];

export const typeDef = (t: QrType) => TYPES.find((d) => d.value === t)!;
export const isQrType = (v: unknown): v is QrType => TYPES.some((d) => d.value === v);

export type Built = { data: string; error?: undefined } | { data?: undefined; error: string };

// ---- helpers --------------------------------------------------------------------------------------

const clean = (s: string | undefined) => (s ?? '').trim();
/** WIFI: and MECARD-style fields escape \ ; , : and " with a backslash. */
const escWifi = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');
/** vCard text values escape \ , ; and newlines. */
const escV = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const digits = (s: string) => s.replace(/[^\d]/g, '');

/** A tidy phone number: keeps a leading +, drops spaces, dashes and brackets. */
export function tidyPhone(s: string): string {
  const t = clean(s);
  return (t.startsWith('+') ? '+' : '') + digits(t);
}

/** Adds https:// when someone types "example.com", and checks it is a real web address. */
export function normalizeUrl(input: string): string | null {
  let s = clean(input);
  if (!s) return null;
  if (!/^[a-z][a-z\d+.-]*:/i.test(s)) s = `https://${s.replace(/^\/+/, '')}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return s;
  } catch {
    return null;
  }
}

const needUrl = (input: string, what: string): Built => {
  if (!clean(input)) return { error: `Enter ${what}.` };
  const u = normalizeUrl(input);
  return u ? { data: u } : { error: `That doesn't look like a web address. Check ${what}.` };
};

/** "20261118T093000" from a datetime-local value (2026-11-18T09:30). Local time, as entered. */
const icsTime = (v: string) => v.replace(/[-:]/g, '').replace(/T(\d{4})$/, (_, hm: string) => `T${hm}00`).slice(0, 15);

function vcard(lines: (string | false | undefined)[]): string {
  return ['BEGIN:VCARD', 'VERSION:3.0', ...lines.filter(Boolean), 'END:VCARD'].join('\r\n');
}

function social(platform: Platform, handle: string): Built {
  const s = clean(handle);
  const site = SOCIAL[platform];
  if (!s) return { error: `Enter a ${site.label} username or link.` };
  if (/^(https?:\/\/|www\.)/i.test(s) || s.includes(`${site.host}/`) || /^youtu\.be\//i.test(s)) return needUrl(s, `the ${site.label} link`);
  const name = s.replace(/^@/, '').replace(/\s+/g, '');
  if (!/^[\w.\-/]+$/.test(name)) return { error: `A ${site.label} username can only have letters, numbers, dots, dashes and underscores.` };
  if (platform === 'linkedin' && /^(in|company|school)\//.test(name)) return { data: `https://www.linkedin.com/${name}` };
  return { data: site.base + name.replace(/^\/+/, '') };
}

// ---- build ----------------------------------------------------------------------------------------

export function buildPayload(type: QrType, f: Fields): Built {
  switch (type) {
    case 'url':
      return needUrl(f.url, 'the website link');
    case 'pdf':
      return needUrl(f.url, 'the link to the PDF');
    case 'text': {
      const t = (f.text ?? '').replace(/\r\n/g, '\n');
      return t.trim() ? { data: t } : { error: 'Type the text to put in the code.' };
    }
    case 'wifi': {
      const ssid = f.ssid ?? '';
      if (!ssid.trim()) return { error: 'Enter the WiFi network name.' };
      const sec = f.security === 'WEP' || f.security === 'nopass' ? f.security : 'WPA';
      const pass = f.password ?? '';
      if (sec !== 'nopass' && !pass) return { error: 'Enter the WiFi password, or choose “No password”.' };
      if (sec === 'WPA' && pass.length < 8) return { error: 'A WPA password is at least 8 characters. Check it.' };
      const hidden = f.hidden === 'true' ? 'H:true;' : '';
      return { data: `WIFI:T:${sec};S:${escWifi(ssid)};${sec === 'nopass' ? '' : `P:${escWifi(pass)};`}${hidden};` };
    }
    case 'vcard': {
      const first = clean(f.first);
      const last = clean(f.last);
      if (!first && !last && !clean(f.org)) return { error: 'Enter at least a name or a company.' };
      const email = clean(f.email);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Check the email address.' };
      const site = clean(f.website) ? normalizeUrl(f.website) : '';
      if (site === null) return { error: 'Check the website address.' };
      const full = [first, last].filter(Boolean).join(' ') || clean(f.org);
      return {
        data: vcard([
          `N:${escV(last)};${escV(first)};;;`,
          `FN:${escV(full)}`,
          clean(f.org) && `ORG:${escV(clean(f.org))}`,
          clean(f.title) && `TITLE:${escV(clean(f.title))}`,
          clean(f.phone) && `TEL;TYPE=CELL:${tidyPhone(f.phone)}`,
          email && `EMAIL:${email}`,
          site && `URL:${site}`,
          clean(f.address) && `ADR;TYPE=WORK:;;${escV(clean(f.address))};;;;`,
        ]),
      };
    }
    case 'business': {
      const org = clean(f.org);
      if (!org) return { error: 'Enter the business name.' };
      const email = clean(f.email);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Check the email address.' };
      const site = clean(f.website) ? normalizeUrl(f.website) : '';
      if (site === null) return { error: 'Check the website address.' };
      if (!clean(f.phone) && !email && !site && !clean(f.address)) return { error: 'Add at least a phone, email, website or address.' };
      const person = clean(f.person);
      return {
        data: vcard([
          person ? `N:${escV(person)};;;;` : `N:;;;;`,
          `FN:${escV(person || org)}`,
          `ORG:${escV(org)}`,
          clean(f.phone) && `TEL;TYPE=WORK:${tidyPhone(f.phone)}`,
          email && `EMAIL;TYPE=WORK:${email}`,
          site && `URL:${site}`,
          clean(f.address) && `ADR;TYPE=WORK:;;${escV(clean(f.address))};;;;`,
          clean(f.note) && `NOTE:${escV(clean(f.note))}`,
        ]),
      };
    }
    case 'email': {
      const to = clean(f.to);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { error: to ? 'Check the email address.' : 'Enter the email address.' };
      const q = [clean(f.subject) && `subject=${encodeURIComponent(clean(f.subject))}`, clean(f.body) && `body=${encodeURIComponent((f.body ?? '').trim())}`].filter(Boolean).join('&');
      return { data: `mailto:${to}${q ? `?${q}` : ''}` };
    }
    case 'phone': {
      const p = tidyPhone(f.phone);
      return digits(p).length >= 3 ? { data: `tel:${p}` } : { error: 'Enter the phone number.' };
    }
    case 'sms': {
      const p = tidyPhone(f.phone);
      if (digits(p).length < 3) return { error: 'Enter the phone number.' };
      const m = (f.message ?? '').trim();
      return { data: `SMSTO:${p}:${m}` };
    }
    case 'whatsapp': {
      const n = digits(f.phone ?? '');
      if (n.length < 8) return { error: 'Enter the WhatsApp number with its country code, for example 91 98765 43210.' };
      if (n.length === 10 && /^[6-9]/.test(n)) return { error: 'Add the country code: for an Indian number put 91 in front.' };
      const m = (f.message ?? '').trim();
      return { data: `https://wa.me/${n}${m ? `?text=${encodeURIComponent(m)}` : ''}` };
    }
    case 'location': {
      const lat = clean(f.lat);
      const lng = clean(f.lng);
      if (lat || lng) {
        const a = Number(lat);
        const b = Number(lng);
        if (!lat || !lng || !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return { error: 'Latitude goes from -90 to 90 and longitude from -180 to 180.' };
        return { data: `https://www.google.com/maps/search/?api=1&query=${a},${b}` };
      }
      const q = clean(f.query);
      if (!q) return { error: 'Enter an address or place, paste a Google Maps link, or give the coordinates.' };
      if (/^(https?:\/\/)?(www\.)?(maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google\.)/i.test(q)) return needUrl(q, 'the Maps link');
      return { data: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` };
    }
    case 'event': {
      const title = clean(f.title);
      if (!title) return { error: 'Enter the event name.' };
      if (!f.start) return { error: 'Choose when the event starts.' };
      if (f.end && f.end < f.start) return { error: 'The event ends before it starts.' };
      const lines = ['BEGIN:VEVENT', `SUMMARY:${escV(title)}`, `DTSTART:${icsTime(f.start)}`, f.end && `DTEND:${icsTime(f.end)}`, clean(f.place) && `LOCATION:${escV(clean(f.place))}`, clean(f.details) && `DESCRIPTION:${escV((f.details ?? '').trim())}`, 'END:VEVENT'];
      return { data: lines.filter(Boolean).join('\r\n') };
    }
    case 'upi': {
      const vpa = clean(f.vpa).toLowerCase();
      if (!vpa) return { error: 'Enter your UPI ID.' };
      if (!/^[a-z0-9.\-_]{2,256}@[a-z][a-z0-9.\-]{1,64}$/.test(vpa)) return { error: 'A UPI ID looks like name@bank, for example shopname@okaxis. Check it.' };
      const parts = [`pa=${encodeURIComponent(vpa).replace(/%40/g, '@')}`];
      if (clean(f.name)) parts.push(`pn=${encodeURIComponent(clean(f.name))}`);
      const amt = clean(f.amount).replace(/,/g, '');
      if (amt) {
        const n = Number(amt);
        if (!/^\d+(\.\d{1,2})?$/.test(amt) || !(n > 0)) return { error: 'Enter the amount in rupees, like 250 or 99.50, or leave it empty.' };
        if (n > 100000) return { error: 'UPI payments by QR are usually limited to ₹1,00,000. Lower the amount or leave it empty.' };
        parts.push(`am=${n.toFixed(2)}`);
      }
      parts.push('cu=INR');
      if (clean(f.note)) parts.push(`tn=${encodeURIComponent(clean(f.note).slice(0, 50))}`);
      return { data: `upi://pay?${parts.join('&')}` };
    }
    case 'review': {
      const s = clean(f.link);
      if (!s) return { error: 'Paste your Google review link or Place ID.' };
      if (/^ChI[\w-]{10,}$/.test(s)) return { data: `https://search.google.com/local/writereview?placeid=${s}` };
      return needUrl(s, 'the review link');
    }
    case 'social':
      return social((f.platform in SOCIAL ? f.platform : 'instagram') as Platform, f.handle);
    case 'youtube':
    case 'instagram':
    case 'facebook':
    case 'linkedin':
      return social(type, f.handle);
    case 'app': {
      const s = clean(f.link);
      if (!s) return { error: 'Paste the store link.' };
      if (f.store === 'play' && /^[a-z][\w]*(\.[a-z][\w]*)+$/i.test(s)) return { data: `https://play.google.com/store/apps/details?id=${s}` };
      return needUrl(s, 'the store link');
    }
  }
}

/** Short label for history lists: what the code holds, in a few words. */
export function describe(type: QrType, f: Fields, data: string): string {
  const pick = (...k: string[]) => k.map((x) => clean(f[x])).find(Boolean);
  const label = typeDef(type).label;
  const what =
    type === 'wifi' ? pick('ssid') : type === 'vcard' ? [clean(f.first), clean(f.last)].filter(Boolean).join(' ') || pick('org') : type === 'business' ? pick('org') : type === 'upi' ? pick('vpa') : type === 'event' ? pick('title') : type === 'email' ? pick('to') : type === 'text' ? data.slice(0, 40) : data.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48);
  return `${label}: ${what ?? ''}`;
}
