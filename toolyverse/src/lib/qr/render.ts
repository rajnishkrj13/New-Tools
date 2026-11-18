import { create } from 'qrcode';

/**
 * Draws a QR code as an SVG from its grid of dark and light squares (modules). Everything is
 * measured in modules, so the same drawing is exported at any size, sharp. The three corner
 * "eyes" are drawn on their own so they can have their own shape, and the squares behind a
 * logo are left out (not just covered), which keeps the code cleaner for scanners.
 */

export type Ecc = 'L' | 'M' | 'Q' | 'H';
export type DotStyle = 'square' | 'rounded' | 'dots';
export type EyeFrame = 'square' | 'rounded' | 'circle';
export type EyeDot = 'square' | 'rounded' | 'circle';
export type Gradient = 'none' | 'linear' | 'radial';
export type LogoPlate = 'none' | 'square' | 'rounded' | 'circle';

export interface Logo {
  /** A data: URL of the logo, already shrunk to at most 512 px. */
  src: string;
  width: number;
  height: number;
}

export interface QrStyle {
  ecc: Ecc;
  /** Quiet zone around the code, in modules. Scanners want at least 2; the standard says 4. */
  margin: number;
  dots: DotStyle;
  eyeFrame: EyeFrame;
  eyeDot: EyeDot;
  fg: string;
  gradient: Gradient;
  fg2: string;
  /** Colour of the corner eyes; empty means the same as the dots. */
  eye: string;
  bg: string;
  transparent: boolean;
  logo: Logo | null;
  /** Logo width as a share of the code (without the margin): 0.12 to 0.32. */
  logoSize: number;
  logoPlate: LogoPlate;
  /** Space between the logo and the edge of its plate, in modules. */
  logoPad: number;
  logoPlateColor: string;
}

export const DEFAULT_STYLE: QrStyle = {
  ecc: 'M',
  margin: 4,
  dots: 'square',
  eyeFrame: 'square',
  eyeDot: 'square',
  fg: '#000000',
  gradient: 'none',
  fg2: '#2a6a8a',
  eye: '',
  bg: '#ffffff',
  transparent: false,
  logo: null,
  logoSize: 0.22,
  logoPlate: 'rounded',
  logoPad: 1,
  logoPlateColor: '#ffffff',
};

/** How much of the code each error correction level can lose and still be read. */
export const ECC_RECOVERY: Record<Ecc, number> = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 };

export interface Matrix {
  size: number;
  dark: (r: number, c: number) => boolean;
  version: number;
}

/** The grid for some text. Throws a plain-words error when the text does not fit. */
export function encode(data: string, ecc: Ecc): Matrix {
  try {
    const qr = create(data, { errorCorrectionLevel: ecc });
    const m = qr.modules;
    return { size: m.size, dark: (r, c) => !!m.get(r, c), version: qr.version };
  } catch {
    throw new Error(
      ecc === 'L'
        ? 'Too much text for one QR code. Shorten it, or put it on a web page and make a code for the link.'
        : 'Too much text for one QR code at this error correction level. Choose a lower level, or shorten the text.',
    );
  }
}

const f = (n: number) => +n.toFixed(3);

/** A rectangle path with each corner rounded by its own radius (top-left, top-right, bottom-right, bottom-left). */
function roundRect(x: number, y: number, w: number, h: number, [tl, tr, br, bl]: number[]): string {
  return (
    `M${f(x + tl)} ${f(y)}H${f(x + w - tr)}` +
    (tr ? `A${tr} ${tr} 0 0 1 ${f(x + w)} ${f(y + tr)}` : '') +
    `V${f(y + h - br)}` +
    (br ? `A${br} ${br} 0 0 1 ${f(x + w - br)} ${f(y + h)}` : '') +
    `H${f(x + bl)}` +
    (bl ? `A${bl} ${bl} 0 0 1 ${f(x)} ${f(y + h - bl)}` : '') +
    `V${f(y + tl)}` +
    (tl ? `A${tl} ${tl} 0 0 1 ${f(x + tl)} ${f(y)}` : '') +
    'Z'
  );
}

const circle = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${f(cy)}a${r} ${r} 0 1 0 ${f(2 * r)} 0a${r} ${r} 0 1 0 ${f(-2 * r)} 0Z`;

function frame(x: number, y: number, style: EyeFrame): string {
  if (style === 'circle') return circle(x + 3.5, y + 3.5, 3.5) + circle(x + 3.5, y + 3.5, 2.5);
  const R = style === 'rounded' ? 2 : 0;
  const r = style === 'rounded' ? 1.2 : 0;
  // The inner hole is drawn as a second shape; fill-rule="evenodd" cuts it out.
  return roundRect(x, y, 7, 7, [R, R, R, R]) + roundRect(x + 1, y + 1, 5, 5, [r, r, r, r]);
}

function pupil(x: number, y: number, style: EyeDot): string {
  if (style === 'circle') return circle(x + 3.5, y + 3.5, 1.5);
  const r = style === 'rounded' ? 0.9 : 0;
  return roundRect(x + 2, y + 2, 3, 3, [r, r, r, r]);
}

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const color = (c: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : fallback);

export interface LogoBox {
  /** Where the logo sits, in modules from the top-left of the code (margin not counted). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The cleared area around it. */
  plate: { x: number; y: number; w: number; h: number };
}

export function logoBox(n: number, s: Pick<QrStyle, 'logo' | 'logoSize' | 'logoPad'>): LogoBox | null {
  if (!s.logo) return null;
  const box = Math.max(3, s.logoSize * n);
  const ratio = s.logo.width / s.logo.height || 1;
  const w = ratio >= 1 ? box : box * ratio;
  const h = ratio >= 1 ? box / ratio : box;
  const pad = Math.max(0, s.logoPad);
  const pw = w + pad * 2;
  const ph = h + pad * 2;
  return { x: (n - w) / 2, y: (n - h) / 2, w, h, plate: { x: (n - pw) / 2, y: (n - ph) / 2, w: pw, h: ph } };
}

/** Share of the code's squares hidden by the logo: compared with ECC_RECOVERY to warn early. */
export function logoCover(m: Matrix, s: QrStyle): number {
  const b = logoBox(m.size, s);
  if (!b) return 0;
  return (b.plate.w * b.plate.h) / (m.size * m.size);
}

const inEye = (r: number, c: number, n: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

export function renderSvg(m: Matrix, s: QrStyle): string {
  const n = m.size;
  const pad = Math.max(0, Math.min(10, Math.round(s.margin)));
  const total = n + pad * 2;
  const box = logoBox(n, s);
  const hidden = (r: number, c: number) => {
    if (!box) return false;
    const p = box.plate;
    // A square is left out when its centre falls under the logo's plate.
    return c + 0.5 > p.x && c + 0.5 < p.x + p.w && r + 0.5 > p.y && r + 0.5 < p.y + p.h;
  };
  const on = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && m.dark(r, c) && !inEye(r, c, n) && !hidden(r, c);

  let body = '';
  if (s.dots === 'square') {
    // Runs of squares in a row become one rectangle: smaller files, no hairline gaps.
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!on(r, c)) {
          c++;
          continue;
        }
        const start = c;
        while (c < n && on(r, c)) c++;
        body += `M${start + pad} ${r + pad}h${c - start}v1h${start - c}Z`;
      }
    }
  } else {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!on(r, c)) continue;
        const x = c + pad;
        const y = r + pad;
        if (s.dots === 'dots') body += circle(x + 0.5, y + 0.5, 0.45);
        else {
          // A corner is rounded only where the square has no neighbour on either side of it,
          // so touching squares flow together like ink.
          const up = on(r - 1, c);
          const down = on(r + 1, c);
          const left = on(r, c - 1);
          const right = on(r, c + 1);
          const k = 0.5;
          body += roundRect(x, y, 1, 1, [!up && !left ? k : 0, !up && !right ? k : 0, !down && !right ? k : 0, !down && !left ? k : 0]);
        }
      }
    }
  }

  const eyes = [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ].map(([x, y]) => [x + pad, y + pad]);
  const frames = eyes.map(([x, y]) => frame(x, y, s.eyeFrame)).join('');
  const pupils = eyes.map(([x, y]) => pupil(x, y, s.eyeDot)).join('');

  const fg = color(s.fg, '#000000');
  const grad = s.gradient !== 'none';
  const fill = grad ? 'url(#qr-ink)' : fg;
  const eyeFill = s.eye && /^#[0-9a-f]{6}$/i.test(s.eye) ? s.eye : fill;
  let defs = '';
  if (grad) {
    const a = `<stop offset="0" stop-color="${fg}"/><stop offset="1" stop-color="${color(s.fg2, fg)}"/>`;
    defs =
      s.gradient === 'radial'
        ? `<radialGradient id="qr-ink" gradientUnits="userSpaceOnUse" cx="${total / 2}" cy="${total / 2}" r="${n * 0.72}">${a}</radialGradient>`
        : `<linearGradient id="qr-ink" gradientUnits="userSpaceOnUse" x1="${pad}" y1="${pad}" x2="${pad + n}" y2="${pad + n}">${a}</linearGradient>`;
  }

  let logo = '';
  if (box && s.logo) {
    const p = box.plate;
    const px = p.x + pad;
    const py = p.y + pad;
    if (s.logoPlate !== 'none') {
      const plateColor = color(s.logoPlateColor, '#ffffff');
      logo +=
        s.logoPlate === 'circle'
          ? `<ellipse cx="${f(px + p.w / 2)}" cy="${f(py + p.h / 2)}" rx="${f((p.w / 2) * 1.12)}" ry="${f((p.h / 2) * 1.12)}" fill="${plateColor}"/>`
          : `<path d="${roundRect(px, py, p.w, p.h, Array(4).fill(s.logoPlate === 'rounded' ? Math.min(p.w, p.h) * 0.22 : 0))}" fill="${plateColor}"/>`;
    }
    logo += `<image href="${escAttr(s.logo.src)}" x="${f(box.x + pad)}" y="${f(box.y + pad)}" width="${f(box.w)}" height="${f(box.h)}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  const bg = s.transparent ? '' : `<rect width="${total}" height="${total}" fill="${color(s.bg, '#ffffff')}"/>`;
  const crisp = s.dots === 'square' && s.eyeFrame === 'square' && s.eyeDot === 'square' ? ' shape-rendering="crispEdges"' : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total * 8}" height="${total * 8}">` +
    (defs ? `<defs>${defs}</defs>` : '') +
    bg +
    `<path d="${body}" fill="${fill}"${crisp}/>` +
    `<path d="${frames}" fill="${eyeFill}" fill-rule="evenodd"${crisp}/>` +
    `<path d="${pupils}" fill="${eyeFill}"${crisp}/>` +
    logo +
    `</svg>`
  );
}

/** The same SVG with its pixel size set, for downloads. */
export const sizedSvg = (svg: string, px: number) => svg.replace(/ width="\d+" height="\d+"/, ` width="${px}" height="${px}"`);

// ---- colour checks -----------------------------------------------------------------------------

function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(color(a, '#000000')), luminance(color(b, '#ffffff'))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Problems with the colours that stop phones reading the code, in plain words. */
export function colourProblems(s: QrStyle): string[] {
  const out: string[] = [];
  const bg = s.transparent ? '#ffffff' : s.bg;
  const inks = [s.fg, ...(s.gradient !== 'none' ? [s.fg2] : []), ...(s.eye ? [s.eye] : [])];
  if (!s.transparent && inks.some((c) => luminance(color(c, '#000000')) > luminance(color(bg, '#ffffff'))))
    out.push('The code is lighter than its background. Many phone cameras cannot read a reversed code; use dark dots on a light background.');
  else if (inks.some((c) => contrast(c, bg) < 4)) out.push('The dots and background are too close in colour. Make the dots darker or the background lighter.');
  if (s.transparent) out.push('Transparent background: put the code on a light, plain surface. On a dark or busy background it will not scan.');
  return out;
}
