/**
 * What a scanned QR code holds, in plain words: the kind of code and its details, read from the
 * formats phones understand (the same ones the generator writes). Pure functions, no DOM.
 */

export type QrKind = 'url' | 'whatsapp' | 'upi' | 'wifi' | 'contact' | 'email' | 'phone' | 'sms' | 'location' | 'event' | 'text';

export interface QrContent {
  kind: QrKind;
  title: string;
  /** Label and value, in reading order. */
  fields: [string, string][];
  /** A link that acts on it (opens the page, the UPI app, the dialler…). */
  href?: string;
  /** Things to check before acting on it. */
  warn: string[];
}

const SHORTENERS = /^(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|cutt\.ly|rb\.gy|shorturl\.at|tiny\.cc|rebrand\.ly|s\.id|v\.gd|t\.ly|qrco\.de|qr\.io|bl\.ink)$/i;

const dec = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
};

/** "KEY:value;KEY:value;;" as in WIFI: and MECARD:, where \ escapes the next character. */
function semiFields(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let key = '';
  let val = '';
  let inKey = true;
  const put = () => {
    if (key && !(key.toUpperCase() in out)) out[key.toUpperCase()] = val;
    key = '';
    val = '';
    inKey = true;
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && i + 1 < body.length) {
      if (inKey) key += body[++i];
      else val += body[++i];
    } else if (inKey && ch === ':') inKey = false;
    else if (ch === ';') put();
    else if (inKey) key += ch;
    else val += ch;
  }
  put();
  return out;
}

/** vCard and iCalendar lines: unfolded, with their name (without parameters) and unescaped value. */
function cardLines(text: string): { name: string; params: string; value: string }[] {
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const unesc = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
  return unfolded
    .split('\n')
    .map((l) => {
      const at = l.indexOf(':');
      if (at < 0) return null;
      const [name, ...params] = l.slice(0, at).split(';');
      return { name: name.replace(/^item\d+\./i, '').toUpperCase(), params: params.join(';'), value: unesc(l.slice(at + 1)) };
    })
    .filter((x): x is { name: string; params: string; value: string } => !!x && !!x.value.trim());
}

/** 20261127T100000Z → 27-11-2026 10:00 (UTC is said as such). */
function icsTime(v: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v.trim());
  if (!m) return v;
  return `${m[3]}-${m[2]}-${m[1]}${m[4] ? ` ${m[4]}:${m[5]}${m[7] ? ' UTC' : ''}` : ''}`;
}

const money = (n: number) => `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

function link(raw: string): QrContent {
  let u: URL | null = null;
  try {
    u = new URL(raw);
  } catch {
    /* not a valid address: shown as it is */
  }
  const host = u?.hostname.replace(/^www\./, '') ?? '';
  // WhatsApp chat links: the number and the ready message.
  if (u && /^(wa\.me|api\.whatsapp\.com|whatsapp\.com)$/i.test(host)) {
    const phone = host === 'wa.me' ? u.pathname.replace(/\D/g, '') : (u.searchParams.get('phone') ?? '').replace(/\D/g, '');
    const text = u.searchParams.get('text') ?? '';
    return { kind: 'whatsapp', title: 'WhatsApp chat', fields: [['Number', phone ? `+${phone}` : 'Not given'], ...(text ? [['Message', text] as [string, string]] : [])], href: raw, warn: [] };
  }
  const warn: string[] = [];
  if (u && u.protocol === 'http:') warn.push('Not a secure link: it starts with http, not https.');
  if (SHORTENERS.test(host)) warn.push('A short link: it hides where it really goes until you open it.');
  if (u && (/(^|\.)xn--/i.test(u.hostname) || /^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname))) warn.push('The address is a bare number or uses look-alike letters: check it carefully.');
  if (u && (u.username || u.password)) warn.push('The link hides its real address after an @ sign: the website is ' + u.hostname + '.');
  return { kind: 'url', title: 'Website link', fields: [['Link', raw], ...(host ? [['Website', host] as [string, string]] : [])], href: u ? raw : undefined, warn };
}

/** The kind of a scanned code and its details. */
export function readContent(raw: string): QrContent {
  const text = raw.trim();
  if (/^https?:\/\//i.test(text)) return link(text);

  if (/^upi:\/\/pay\?/i.test(text)) {
    const q = new URLSearchParams(text.slice(text.indexOf('?') + 1));
    const amount = Number(q.get('am'));
    const fields: [string, string][] = [
      ['Pay to (UPI ID)', q.get('pa') ?? 'Not given'],
      ['Name', q.get('pn') ?? 'Not given'],
      ['Amount', q.get('am') && amount > 0 ? money(amount) : 'You type the amount'],
    ];
    if (q.get('tn')) fields.push(['Note', q.get('tn')!]);
    if (q.get('mc')) fields.push(['Merchant code', q.get('mc')!]);
    return {
      kind: 'upi',
      title: 'UPI payment',
      fields,
      href: text,
      warn: ['Before you enter your UPI PIN, check that the name and UPI ID are who you mean to pay.', 'You never need to scan a code or enter your PIN to receive money.'],
    };
  }

  if (/^WIFI:/i.test(text)) {
    const f = semiFields(text.slice(5));
    const sec = (f.T ?? '').toUpperCase();
    return {
      kind: 'wifi',
      title: 'WiFi network',
      fields: [
        ['Network name', f.S ?? ''],
        ['Password', sec === 'NOPASS' || !f.P ? 'None (open network)' : f.P],
        ['Security', sec === 'NOPASS' || !sec ? 'None' : sec === 'WEP' ? 'WEP' : 'WPA / WPA2 / WPA3'],
        ...(/^true$/i.test(f.H ?? '') ? [['Hidden network', 'Yes'] as [string, string]] : []),
      ],
      warn: [],
    };
  }

  if (/^BEGIN:VCARD/i.test(text)) {
    const fields: [string, string][] = [];
    const lines = cardLines(text);
    const fn = lines.find((l) => l.name === 'FN')?.value;
    const n = lines.find((l) => l.name === 'N')?.value.split(';');
    const name = fn || (n ? [n[3], n[1], n[2], n[0], n[4]].filter(Boolean).join(' ') : '');
    if (name) fields.push(['Name', name]);
    for (const l of lines) {
      if (l.name === 'ORG') fields.push(['Company', l.value.split(';').filter(Boolean).join(', ')]);
      else if (l.name === 'TITLE') fields.push(['Job title', l.value]);
      else if (l.name === 'TEL') fields.push([/cell|mobile/i.test(l.params) ? 'Mobile' : /work/i.test(l.params) ? 'Work phone' : 'Phone', l.value]);
      else if (l.name === 'EMAIL') fields.push(['Email', l.value]);
      else if (l.name === 'URL') fields.push(['Website', l.value]);
      else if (l.name === 'ADR') fields.push(['Address', l.value.split(';').map((s) => s.trim()).filter(Boolean).join(', ')]);
      else if (l.name === 'NOTE') fields.push(['Note', l.value]);
    }
    return { kind: 'contact', title: 'Contact card', fields, warn: [] };
  }

  if (/^MECARD:/i.test(text)) {
    const f = semiFields(text.slice(7));
    const name = (f.N ?? '').split(',').reverse().join(' ').trim();
    const fields = ([['Name', name], ['Company', f.ORG], ['Phone', f.TEL], ['Email', f.EMAIL], ['Website', f.URL], ['Address', f.ADR], ['Note', f.NOTE]] as [string, string | undefined][]).filter((x): x is [string, string] => !!x[1]);
    return { kind: 'contact', title: 'Contact card', fields, warn: [] };
  }

  if (/^mailto:/i.test(text)) {
    const [to, query = ''] = text.slice(7).split('?');
    const q = new URLSearchParams(query);
    const fields: [string, string][] = [['To', dec(to)]];
    if (q.get('subject')) fields.push(['Subject', q.get('subject')!]);
    if (q.get('body')) fields.push(['Message', q.get('body')!]);
    return { kind: 'email', title: 'Email', fields, href: text, warn: [] };
  }
  if (/^MATMSG:/i.test(text)) {
    const f = semiFields(text.slice(7));
    const fields = ([['To', f.TO], ['Subject', f.SUB], ['Message', f.BODY]] as [string, string | undefined][]).filter((x): x is [string, string] => !!x[1]);
    return { kind: 'email', title: 'Email', fields, href: f.TO ? `mailto:${f.TO}?subject=${encodeURIComponent(f.SUB ?? '')}&body=${encodeURIComponent(f.BODY ?? '')}` : undefined, warn: [] };
  }

  if (/^tel:/i.test(text)) return { kind: 'phone', title: 'Phone call', fields: [['Number', text.slice(4)]], href: text, warn: [] };

  if (/^(smsto|sms|mms):/i.test(text)) {
    const body = text.slice(text.indexOf(':') + 1);
    let number = body;
    let message = '';
    if (/^smsto:/i.test(text)) {
      const at = body.indexOf(':');
      if (at >= 0) [number, message] = [body.slice(0, at), body.slice(at + 1)];
    } else {
      const [n, query = ''] = body.split('?');
      number = n;
      message = new URLSearchParams(query).get('body') ?? '';
    }
    return { kind: 'sms', title: 'Text message (SMS)', fields: [['Number', number], ...(message ? [['Message', message] as [string, string]] : [])], href: `sms:${number}${message ? `?body=${encodeURIComponent(message)}` : ''}`, warn: [] };
  }

  if (/^geo:/i.test(text)) {
    const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i.exec(text);
    const q = new URLSearchParams(text.split('?')[1] ?? '').get('q');
    if (m) return { kind: 'location', title: 'Location', fields: [['Latitude, longitude', `${m[1]}, ${m[2]}`], ...(q ? [['Place', q] as [string, string]] : [])], href: `https://www.google.com/maps?q=${m[1]},${m[2]}`, warn: [] };
  }

  if (/BEGIN:VEVENT/i.test(text)) {
    const lines = cardLines(text);
    const get = (n: string) => lines.find((l) => l.name === n)?.value;
    const fields = ([['Event', get('SUMMARY')], ['Starts', get('DTSTART') && icsTime(get('DTSTART')!)], ['Ends', get('DTEND') && icsTime(get('DTEND')!)], ['Place', get('LOCATION')], ['Details', get('DESCRIPTION')]] as [string, string | undefined][]).filter((x): x is [string, string] => !!x[1]);
    return { kind: 'event', title: 'Calendar event', fields, warn: [] };
  }

  // A web address written without http.
  if (/^www\.[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(text)) return link(`https://${text}`);
  return { kind: 'text', title: 'Text', fields: [['Text', raw]], warn: [] };
}
