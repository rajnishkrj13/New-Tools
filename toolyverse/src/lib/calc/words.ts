/** Numbers written in English words, in Indian (lakh, crore) or international (million) style. */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below100(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? below100(rest) : ''].filter(Boolean).join(' ');
}

/** Whole number (as a digit string, so large values stay exact) in words. */
export function integerToWords(digits: string, style: 'indian' | 'international'): string {
  const s = digits.replace(/^0+/, '');
  if (!s) return 'Zero';
  const parts: string[] = [];
  if (style === 'international') {
    const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion', 'Quadrillion'];
    const groups: number[] = [];
    for (let end = s.length; end > 0; end -= 3) groups.unshift(Number(s.slice(Math.max(0, end - 3), end)));
    if (groups.length > scales.length) throw new Error('That number is too large.');
    groups.forEach((g, i) => {
      const scale = scales[groups.length - 1 - i];
      if (g) parts.push(below1000(g) + (scale ? ` ${scale}` : ''));
    });
    return parts.join(' ');
  }
  // Indian: last three digits, then pairs (thousand, lakh), then crores which repeat the pattern.
  if (s.length > 7) {
    const crore = s.slice(0, s.length - 7);
    const rest = s.slice(s.length - 7);
    const head = integerToWords(crore, 'indian');
    const tail = rest.replace(/^0+/, '') ? integerToWords(rest, 'indian') : '';
    return [`${head} Crore`, tail].filter(Boolean).join(' ');
  }
  const n = Number(s);
  const lakh = Math.floor(n / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}

export interface WordsOptions {
  style: 'indian' | 'international';
  currency: 'none' | 'inr';
}

/** "1234.5" → "One Thousand Two Hundred Thirty-Four Point Five", or rupees and paise. */
export function numberToWords(input: string, opt: WordsOptions): string {
  const clean = input.replace(/[,\s₹]/g, '').replace(/^rs\.?/i, '');
  if (!/^-?\d*(\.\d*)?$/.test(clean) || !/\d/.test(clean)) throw new Error('Enter digits only, for example 125000.50');
  const negative = clean.startsWith('-');
  const [intPart = '0', fracRaw = ''] = clean.replace('-', '').split('.');
  if (intPart.replace(/^0+/, '').length > 18) throw new Error('That number is too large.');
  let out: string;
  if (opt.currency === 'inr') {
    // Paise: two decimals, rounded.
    let rupees = BigInt(intPart || '0');
    let paise = Math.round(Number(`0.${fracRaw || '0'}`) * 100);
    if (paise === 100) {
      rupees += BigInt(1);
      paise = 0;
    }
    const r = integerToWords(rupees.toString(), opt.style);
    out = paise ? `Rupees ${r} and ${below100(paise)} Paise Only` : `Rupees ${r} Only`;
    if (rupees === BigInt(0) && paise) out = `${below100(paise)} Paise Only`;
  } else {
    out = integerToWords(intPart || '0', opt.style);
    if (fracRaw) out += ` Point ${fracRaw.split('').map((d) => (d === '0' ? 'Zero' : ONES[Number(d)])).join(' ')}`;
  }
  return negative ? `Minus ${out}` : out;
}

/** 1234567.5 → "12,34,567.50" for showing amounts the Indian way. */
export function groupIndian(digits: string): string {
  const [i, f] = digits.split('.');
  const last3 = i.slice(-3);
  const rest = i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (rest ? `${rest},${last3}` : last3) + (f !== undefined ? `.${f}` : '');
}
