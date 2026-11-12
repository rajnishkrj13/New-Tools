import type { Matrix, Rect } from '../types/pdf';
import { IDENTITY, applyMatrix, mul } from './CoordinateMapper';

/**
 * Real removal of original text from a page's content stream.
 *
 * Covering text with a rectangle leaves it in the file (searchable, copyable). To take it
 * out, the glyphs themselves must be deleted from the text-showing operators (Tj, TJ, ', ").
 *
 * Two views of the same page are combined:
 *   1. PDF.js' operator list tells where every glyph of every text operator lands on the
 *      page (it knows the fonts, widths and encodings).
 *   2. A small tokenizer finds the same operators as byte ranges in the raw content stream.
 * The n-th text operator of one is the n-th of the other. Glyphs inside the areas to clear
 * are cut out of their strings and replaced by an equal TJ displacement, so every glyph
 * that stays keeps its exact position.
 *
 * If the two views do not line up (unusual encodings, damaged streams), nothing is changed
 * and the caller falls back to covering the text.
 */

export interface GlyphInfo {
  /** Centre of the glyph on its baseline, in view space. */
  x: number;
  y: number;
  /** TJ number that moves the pen exactly as far as this glyph did. */
  comp: number;
}

export interface TextOpInfo {
  glyphs: GlyphInfo[];
  /** False for vertical writing, which is not rewritten. */
  editable: boolean;
}

interface OperatorList {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<any>;
}

/** Walks a PDF.js operator list and records the position of every glyph drawn by the page itself. */
export function analyzeOperatorList(
  list: OperatorList,
  OPS: Record<string, number>,
  viewTransform: Matrix,
  fontInfo: (name: string) => { fontMatrix0: number; vertical: boolean } | null,
): TextOpInfo[] {
  const out: TextOpInfo[] = [];
  let st = {
    ctm: IDENTITY as Matrix, tm: IDENTITY as Matrix, x: 0, y: 0, lineX: 0, lineY: 0,
    size: 0, dir: 1, tc: 0, tw: 0, hs: 1, leading: 0, rise: 0, fm0: 0.001, vertical: false,
  };
  const stack: (typeof st)[] = [];
  // Text inside form XObjects and annotations lives in other streams and is left alone.
  let nested = 0;
  const moveText = (x: number, y: number) => {
    st.x = st.lineX += x;
    st.y = st.lineY += y;
  };
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const a = list.argsArray[i];
    if (fn === OPS.paintFormXObjectBegin || fn === OPS.beginAnnotation) {
      nested++;
      continue;
    }
    if (fn === OPS.paintFormXObjectEnd || fn === OPS.endAnnotation) {
      nested = Math.max(0, nested - 1);
      continue;
    }
    if (nested) continue;
    switch (fn) {
      case OPS.save:
        stack.push({ ...st });
        break;
      case OPS.restore:
        if (stack.length) st = stack.pop()!;
        break;
      case OPS.transform:
        st.ctm = mul(st.ctm, [a[0], a[1], a[2], a[3], a[4], a[5]]);
        break;
      case OPS.beginText:
        st.tm = IDENTITY;
        st.x = st.y = st.lineX = st.lineY = 0;
        break;
      case OPS.setCharSpacing:
        st.tc = a[0];
        break;
      case OPS.setWordSpacing:
        st.tw = a[0];
        break;
      case OPS.setHScale:
        st.hs = a[0] / 100;
        break;
      case OPS.setLeading:
        st.leading = -a[0];
        break;
      case OPS.setTextRise:
        st.rise = a[0];
        break;
      case OPS.setFont: {
        const info = fontInfo(a[0]);
        st.size = Math.abs(a[1]);
        st.dir = a[1] < 0 ? -1 : 1;
        st.fm0 = info?.fontMatrix0 || 0.001;
        st.vertical = !!info?.vertical;
        break;
      }
      case OPS.moveText:
        moveText(a[0], a[1]);
        break;
      case OPS.setLeadingMoveText:
        st.leading = a[1];
        moveText(a[0], a[1]);
        break;
      case OPS.setTextMatrix: {
        const m = a.length === 1 ? a[0] : a;
        st.tm = [m[0], m[1], m[2], m[3], m[4], m[5]];
        st.x = st.y = st.lineX = st.lineY = 0;
        break;
      }
      case OPS.nextLine:
        moveText(0, st.leading);
        break;
      case OPS.showText: {
        const hs = st.hs * st.dir;
        const scale = st.size * st.fm0;
        const toView = mul(viewTransform, mul(st.ctm, st.tm));
        const glyphs: GlyphInfo[] = [];
        let xl = 0;
        for (const g of a[0] as any[]) {
          if (typeof g === 'number') {
            xl -= (g * st.size) / 1000;
            continue;
          }
          if (!g) continue;
          const w = (g.width || 0) * scale + ((g.isSpace ? st.tw : 0) + st.tc) * st.dir;
          const [x, y] = applyMatrix(toView, st.x + (xl + w / 2) * hs, st.y + st.rise);
          glyphs.push({ x, y, comp: st.size ? (-w * 1000) / st.size : 0 });
          xl += w;
        }
        if (!st.vertical) st.x += xl * hs;
        out.push({ glyphs, editable: !st.vertical });
        break;
      }
    }
  }
  return out;
}

// ---- content stream tokenizer --------------------------------------------------------------

type Elem = Uint8Array | number;

interface ShowOp {
  /** Byte range of the operator including its operands. */
  start: number;
  end: number;
  kind: 'Tj' | 'TJ' | "'" | '"';
  elems: Elem[];
  /** Word and character spacing operands of the " operator. */
  spacing?: [number, number];
  valid: boolean;
}

const isWs = (c: number) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
const isDelim = (c: number) =>
  c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/** An XObject paint operator ("/Name Do") with its byte range. */
export interface DoOp {
  start: number;
  end: number;
  /** Resource name as written in the stream, without the slash. */
  name: string;
}

/**
 * Finds every text-showing operator of a content stream with its operands and byte range.
 * When `dos` is given, the XObject paint operators are collected into it as well.
 */
export function scanShowOps(b: Uint8Array, dos?: DoOp[]): ShowOp[] {
  const ops: ShowOp[] = [];
  let lastName: { start: number; name: string } | null = null;
  const n = b.length;
  let i = 0;
  let operands: { start: number; value: Elem | Elem[] | null }[] = [];
  let arr: Elem[] | null = null;
  let arrStart = 0;
  const push = (start: number, value: Elem | null) => {
    if (arr && value !== null) arr.push(value);
    else if (!arr) operands.push({ start, value });
  };
  while (i < n) {
    const c = b[i];
    if (isWs(c)) {
      i++;
    } else if (c === 0x25) {
      while (i < n && b[i] !== 10 && b[i] !== 13) i++;
    } else if (c === 0x28) {
      const start = i++;
      const bytes: number[] = [];
      let depth = 1;
      while (i < n && depth > 0) {
        const ch = b[i++];
        if (ch === 0x5c) {
          const e = b[i++];
          if (e === 0x6e) bytes.push(10);
          else if (e === 0x72) bytes.push(13);
          else if (e === 0x74) bytes.push(9);
          else if (e === 0x62) bytes.push(8);
          else if (e === 0x66) bytes.push(12);
          else if (e >= 0x30 && e <= 0x37) {
            let v = e - 0x30;
            for (let k = 0; k < 2 && b[i] >= 0x30 && b[i] <= 0x37; k++) v = v * 8 + (b[i++] - 0x30);
            bytes.push(v & 255);
          } else if (e === 13) {
            if (b[i] === 10) i++;
          } else if (e !== 10) bytes.push(e);
        } else if (ch === 0x28) {
          depth++;
          bytes.push(ch);
        } else if (ch === 0x29) {
          if (--depth > 0) bytes.push(ch);
        } else bytes.push(ch);
      }
      push(start, Uint8Array.from(bytes));
    } else if (c === 0x3c) {
      if (b[i + 1] === 0x3c) {
        push(i, null);
        i += 2;
      } else {
        const start = i++;
        let hex = '';
        while (i < n && b[i] !== 0x3e) {
          if (!isWs(b[i])) hex += String.fromCharCode(b[i]);
          i++;
        }
        i++;
        if (hex.length % 2) hex += '0';
        const bytes = new Uint8Array(hex.length / 2);
        for (let k = 0; k < bytes.length; k++) bytes[k] = parseInt(hex.substr(k * 2, 2), 16) || 0;
        push(start, bytes);
      }
    } else if (c === 0x3e) {
      i += b[i + 1] === 0x3e ? 2 : 1;
    } else if (c === 0x5b) {
      if (!arr) {
        arr = [];
        arrStart = i;
      }
      i++;
    } else if (c === 0x5d) {
      if (arr) operands.push({ start: arrStart, value: arr });
      arr = null;
      i++;
    } else if (c === 0x2f) {
      const start = i++;
      while (i < n && !isWs(b[i]) && !isDelim(b[i])) i++;
      lastName = { start, name: String.fromCharCode(...b.subarray(start + 1, i)) };
      push(start, null);
    } else if (c === 0x7b || c === 0x7d || c === 0x29) {
      i++;
    } else {
      const start = i;
      while (i < n && !isWs(b[i]) && !isDelim(b[i])) i++;
      const word = String.fromCharCode(...b.subarray(start, i));
      if (NUMBER.test(word)) {
        push(start, parseFloat(word));
        continue;
      }
      if (word === 'BI') {
        // Inline image: skip its binary data up to the EI that ends it.
        let j = i;
        while (j < n - 2 && !(isWs(b[j]) && b[j + 1] === 0x49 && b[j + 2] === 0x44 && isWs(b[j + 3]))) j++;
        j += 4;
        while (j < n - 2 && !(isWs(b[j]) && b[j + 1] === 0x45 && b[j + 2] === 0x49 && (j + 3 >= n || isWs(b[j + 3])))) j++;
        i = Math.min(n, j + 3);
      } else if (word === 'Tj' || word === 'TJ' || word === "'" || word === '"') {
        const last = operands[operands.length - 1];
        const op: ShowOp = { start: last?.start ?? start, end: i, kind: word, elems: [], valid: false };
        if (word === 'TJ' && Array.isArray(last?.value)) {
          op.elems = last.value;
          op.valid = true;
        } else if (word !== 'TJ' && last?.value instanceof Uint8Array) {
          op.elems = [last.value];
          op.valid = true;
          if (word === '"') {
            const aw = operands[operands.length - 3];
            const ac = operands[operands.length - 2];
            if (typeof aw?.value === 'number' && typeof ac?.value === 'number') {
              op.start = aw.start;
              op.spacing = [aw.value, ac.value];
            } else op.valid = false;
          }
        }
        ops.push(op);
      } else if (word === 'Do' && dos && lastName && operands[operands.length - 1]?.start === lastName.start) {
        dos.push({ start: lastName.start, end: i, name: lastName.name });
      }
      operands = [];
      arr = null;
    }
  }
  return ops;
}

const num = (v: number) => {
  const s = v.toFixed(3).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};
const hexString = (bytes: number[]) => `<${bytes.map((x) => x.toString(16).padStart(2, '0')).join('')}>`;

export interface RemovalResult {
  bytes: Uint8Array;
  /** Number of glyphs removed inside each rectangle (same order as the input). */
  removedPerRect: number[];
  removedGlyphs: number;
}

/**
 * Deletes every glyph whose centre lies inside one of `rects` (view space).
 * Returns { error } and changes nothing when the stream and the glyph map disagree.
 */
export function removeGlyphsFromContent(content: Uint8Array, info: TextOpInfo[], rects: Rect[]): RemovalResult | { error: string } {
  const ops = scanShowOps(content);
  if (ops.length !== info.length) return { error: `operator count differs (${ops.length} in stream, ${info.length} rendered)` };
  const removedPerRect = rects.map(() => 0);
  const edits: { start: number; end: number; text: string }[] = [];
  let removedGlyphs = 0;

  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    const glyphs = info[k].glyphs;
    const byteCount = op.elems.reduce<number>((s, e) => s + (typeof e === 'number' ? 0 : e.length), 0);
    // One or two bytes per glyph; anything else means the two views are out of step.
    const per = glyphs.length ? byteCount / glyphs.length : byteCount === 0 ? 1 : NaN;
    if (!op.valid || (per !== 1 && per !== 2)) return { error: 'text encoding cannot be mapped to glyphs' };

    const remove = glyphs.map((g) => {
      const r = rects.findIndex((rc) => g.x >= rc.x - 0.01 && g.x <= rc.x + rc.width && g.y >= rc.y && g.y <= rc.y + rc.height);
      if (r >= 0) removedPerRect[r]++;
      return r >= 0;
    });
    if (!remove.some(Boolean)) continue;
    if (!info[k].editable) return { error: 'vertical text cannot be rewritten' };

    const parts: string[] = [];
    let kept: number[] = [];
    let shift = 0;
    let g = 0;
    const flushKept = () => {
      if (kept.length) parts.push(hexString(kept));
      kept = [];
    };
    const flushShift = () => {
      if (Math.abs(shift) > 0.0005) parts.push(num(shift));
      shift = 0;
    };
    for (const e of op.elems) {
      if (typeof e === 'number') {
        flushKept();
        shift += e;
        continue;
      }
      for (let p = 0; p < e.length; p += per, g++) {
        if (remove[g]) {
          flushKept();
          shift += glyphs[g].comp;
          removedGlyphs++;
        } else {
          flushShift();
          for (let q = 0; q < per; q++) kept.push(e[p + q]);
        }
      }
    }
    flushKept();
    flushShift();
    let text = `[${parts.join(' ')}] TJ`;
    if (op.kind === "'") text = `T* ${text}`;
    else if (op.kind === '"') text = `${num(op.spacing![0])} Tw ${num(op.spacing![1])} Tc T* ${text}`;
    edits.push({ start: op.start, end: op.end, text });
  }

  if (!edits.length) return { bytes: content, removedPerRect, removedGlyphs: 0 };
  const chunks: Uint8Array[] = [];
  let pos = 0;
  const enc = new TextEncoder();
  for (const e of edits) {
    chunks.push(content.subarray(pos, e.start), enc.encode(e.text));
    pos = e.end;
  }
  chunks.push(content.subarray(pos));
  const bytes = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.length;
  }
  return { bytes, removedPerRect, removedGlyphs };
}
