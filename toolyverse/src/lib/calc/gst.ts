/** GST arithmetic and GSTIN checks. Amounts are rounded to paise only when shown. */

/** The main GST rates since 22 September 2025 (GST 2.0); any other rate can be typed. */
export const GST_RATES = [5, 18, 40];

export interface GstResult {
  base: number;
  tax: number;
  total: number;
  /** Within the state: half each. */
  cgst: number;
  sgst: number;
  /** Between states. */
  igst: number;
}

export function gst(amount: number, rate: number, mode: 'add' | 'remove'): GstResult {
  const base = mode === 'add' ? amount : (amount * 100) / (100 + rate);
  const tax = (base * rate) / 100;
  const total = base + tax;
  return { base, tax, total, cgst: tax / 2, sgst: tax / 2, igst: tax };
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rupees = (n: number) => `₹${inr.format(r2(n))}`;

/** GST state codes, as printed in the first two digits of a GSTIN. */
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction',
};

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The 15th character of a GSTIN, computed from the first 14 (mod-36 scheme used by GSTN). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export interface GstinCheck {
  input: string;
  gstin: string;
  valid: boolean;
  problems: string[];
  state?: string;
  pan?: string;
  entity?: string;
  panHolder?: string;
}

const HOLDER: Record<string, string> = {
  P: 'Individual', C: 'Company', H: 'Hindu Undivided Family', F: 'Firm / LLP', A: 'Association of Persons', T: 'Trust', B: 'Body of Individuals',
  L: 'Local authority', J: 'Artificial juridical person', G: 'Government', E: 'LLP', K: 'Krish (insolvency)',
};

export function checkGstin(input: string): GstinCheck {
  const gstin = input.toUpperCase().replace(/[\s-]/g, '');
  const problems: string[] = [];
  if (gstin.length !== 15) problems.push(`It has ${gstin.length} characters; a GSTIN has 15.`);
  else {
    const state = gstin.slice(0, 2);
    const pan = gstin.slice(2, 12);
    if (!GST_STATES[state]) problems.push(`"${state}" is not a GST state code.`);
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) problems.push(`Characters 3–12 should be a PAN (5 letters, 4 digits, 1 letter); found "${pan}".`);
    if (!/^[1-9A-Z]$/.test(gstin[12])) problems.push('The 13th character (registration number) should be 1–9 or a letter.');
    if (!/^[A-Z0-9]$/.test(gstin[13])) problems.push('The 14th character should be a letter or digit (usually Z).');
    if (!/[^0-9A-Z]/.test(gstin) && !problems.length) {
      const expected = gstinCheckChar(gstin.slice(0, 14));
      if (expected !== gstin[14]) problems.push(`The check character should be "${expected}", not "${gstin[14]}". There is probably a typing mistake.`);
    } else if (/[^0-9A-Z]/.test(gstin)) problems.push('Only letters and digits are allowed.');
    if (!problems.length || GST_STATES[state]) {
      const ok = !problems.length;
      return {
        input,
        gstin,
        valid: ok,
        problems,
        state: GST_STATES[state],
        pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) ? pan : undefined,
        entity: gstin[12],
        panHolder: HOLDER[pan[3]],
      };
    }
  }
  return { input, gstin, valid: false, problems };
}
