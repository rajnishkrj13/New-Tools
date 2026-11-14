import type { Paragraph, TextLine } from '../types/text';

/**
 * Paragraph detection and paragraph-level reflow.
 *
 * The engine never touches text outside the paragraph being edited. It works on a
 * plain list of lines (the edited layout model); the original layout model stays in
 * the paragraph / edit object and is only read.
 */

export interface FlowLine {
  text: string;
  /** True when the break after this line is a wrap (the next line continues the sentence). */
  soft: boolean;
}

/** Measures `text` as it would be drawn in line slot `slot`. */
export type SlotMeasure = (text: string, slot: number) => number;
/** Width available in line slot `slot`. */
export type SlotWidth = (slot: number) => number;

export const FIT_TOLERANCE = 1.03;

export const splitWords =(text: string): string[] => text.split(/\s+/).filter(Boolean);
export const normalizeSpaces = (text: string): string => splitWords(text).join(' ');

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Reflows a paragraph after line `start` changed.
 *
 * - Lines before `start` are returned untouched.
 * - The edited line and the lines soft-wrapped after it are treated as one run of words
 *   and wrapped greedily: text that grew pushes words down (adding lines when needed),
 *   text that shrank pulls words up (removing lines that become empty).
 * - As soon as the remaining words are exactly the words of the remaining original
 *   lines, those lines are kept as they are, so a small edit does not re-break the
 *   rest of the paragraph.
 * - Hard line ends are preserved: overflow from a hard-ended line gets its own new line.
 *
 * With `all = true` every line group is re-wrapped (used when the font size changes).
 */
export function reflowFrom(
  lines: FlowLine[],
  start: number,
  widthFor: SlotWidth,
  measure: SlotMeasure,
  all = false,
): FlowLine[] {
  const n = lines.length;
  const out: FlowLine[] = lines.slice(0, start);
  let i = start;
  while (i < n) {
    // Collect the group: line i plus every following line joined to it by a soft break.
    let j = i;
    const words: string[] = [];
    const counts: number[] = [];
    for (;;) {
      const w = splitWords(lines[j].text);
      counts.push(w.length);
      words.push(...w);
      if (lines[j].soft && j + 1 < n) j++;
      else break;
    }
    if (i !== start && !all) {
      for (let k = i; k <= j; k++) out.push(lines[k]);
      i = j + 1;
      continue;
    }
    // remaining word count -> original line index where the untouched tail starts
    const tailAt = new Map<number, number>();
    if (!all) {
      let acc = 0;
      for (let k = counts.length - 1; k >= 1; k--) {
        acc += counts[k];
        if (counts[k] > 0) tailAt.set(acc, i + k);
      }
    }
    let pos = 0;
    let emitted = 0;
    while (pos < words.length) {
      if (emitted > 0) {
        const at = tailAt.get(words.length - pos);
        if (at !== undefined) {
          for (let k = at; k <= j; k++) out.push(lines[k]);
          pos = words.length;
          break;
        }
      }
      const slot = out.length;
      // A line may run a few percent over: it is then squeezed to fit instead of
      // sending a word down and re-breaking the whole paragraph for a tiny edit.
      // (Only for the edited line's own words - never to pull extra words up.)
      const own = emitted === 0 && !all ? counts[0] : 0;
      const max = widthFor(slot);
      let line = words[pos++];
      while (pos < words.length && measure(`${line} ${words[pos]}`, slot) <= max * (pos < own ? FIT_TOLERANCE : 1) + 0.01) {
        line += ` ${words[pos++]}`;
      }
      out.push({ text: line, soft: true });
      emitted++;
    }
    const last = out.length - 1;
    if (emitted > 0 && last >= start && out[last].soft) out[last] = { text: out[last].text, soft: false };
    i = j + 1;
  }
  return out;
}

/** Plain greedy word wrap for free text boxes. Explicit newlines are kept. */
export function wrapText(text: string, maxWidth: number, measure: (t: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r/g, '').split('\n')) {
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = '';
    for (const w of words) {
      if (line && measure((line + w).trimEnd()) > maxWidth + 0.01) {
        out.push(line.trimEnd());
        line = /^\s+$/.test(w) ? '' : w;
      } else {
        line += w;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** Width of the first word of a line, estimated from the line's own geometry. */
function firstWordWidth(line: TextLine): number {
  const trimmed = line.text.trimStart();
  const first = trimmed.split(/\s+/)[0] ?? '';
  const len = line.text.trim().length || 1;
  return (line.right - line.x) * (first.length / len);
}

/**
 * A break after line i is soft when the first word of line i+1 would not have fitted
 * on line i - that is what a typesetter's wrap looks like.
 */
export function detectSoftBreaks(lines: TextLine[], right: number): boolean[] {
  return lines.map((line, i) => {
    const next = lines[i + 1];
    if (!next) return false;
    const space = line.fontSize * 0.25;
    return line.right + space + firstWordWidth(next) > right + 0.5;
  });
}

/**
 * Groups lines into paragraphs: same font size, consistent left margin (allowing a
 * first-line indent), consistent line spacing and horizontal overlap.
 */
export function groupParagraphs(lines: TextLine[], pageIndex: number, pageHeight: number, key = String(pageIndex), pageWidth = 0): Paragraph[] {
  const sorted = [...lines].sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  interface Draft {
    lines: TextLine[];
    left: number;
    right: number;
    gap: number;
  }
  const drafts: Draft[] = [];
  for (const line of sorted) {
    let target: Draft | undefined;
    for (let d = drafts.length - 1; d >= 0 && d >= drafts.length - 12; d--) {
      const p = drafts[d];
      const last = p.lines[p.lines.length - 1];
      const fs = last.fontSize;
      const gap = line.baseline - last.baseline;
      if (Math.abs(line.fontSize - fs) > fs * 0.08) continue;
      if (gap < fs * 0.6 || gap > fs * 1.9) continue;
      if (p.lines.length >= 2 && Math.abs(gap - p.gap) > p.gap * 0.15) continue;
      const dx = Math.abs(line.x - p.left);
      const aligned = dx <= fs * 0.6 || (p.lines.length === 1 && dx <= fs * 3);
      if (!aligned) continue;
      if (line.x >= p.right || line.right <= Math.min(p.left, line.x)) continue;
      target = p;
      break;
    }
    if (target) {
      if (target.lines.length === 1) target.left = line.x;
      target.gap = target.lines.length === 1 ? line.baseline - target.lines[0].baseline : target.gap;
      target.lines.push(line);
      target.right = Math.max(target.right, line.right);
    } else {
      drafts.push({ lines: [line], left: line.x, right: line.right, gap: line.fontSize * 1.2 });
    }
  }

  // Text may run as far as the widest line, or up to a right margin as wide as the left one,
  // so a line that is itself the widest on its page can still grow a little when edited.
  const leftMargin = lines.reduce((m, l) => Math.min(m, l.x), Infinity);
  const pageRight = Math.max(lines.reduce((m, l) => Math.max(m, l.right), 0), pageWidth && Number.isFinite(leftMargin) ? pageWidth - leftMargin : 0);
  return drafts.map((d, idx) => {
    const fontSize = median(d.lines.map((l) => l.fontSize));
    const top = Math.min(...d.lines.map((l) => l.top));
    const bottom = Math.max(...d.lines.map((l) => l.bottom));
    const left = Math.min(...d.lines.map((l) => l.x));
    const inPara = new Set(d.lines);
    const soft = detectSoftBreaks(d.lines, d.right);
    const flowing = soft.some(Boolean);

    // A paragraph that really wraps keeps its own measure. A single line / list of
    // short lines may grow to the next thing on its right, or to the page text margin.
    let maxRight = d.right;
    if (!flowing) {
      let limit = Math.max(pageRight, d.right);
      for (const l of lines) {
        if (inPara.has(l) || l.x < d.right - 1) continue;
        if (l.bottom > top && l.top < bottom) limit = Math.min(limit, l.x - fontSize * 0.6);
      }
      maxRight = Math.max(d.right, limit);
    }

    let spaceBelow = pageHeight - bottom;
    for (const l of lines) {
      if (inPara.has(l) || l.top < bottom - 1) continue;
      if (l.x < maxRight && l.right > left) spaceBelow = Math.min(spaceBelow, l.top - bottom);
    }

    const gaps = d.lines.slice(1).map((l, k) => l.baseline - d.lines[k].baseline);
    return {
      id: `p${key}_${idx}`,
      pageIndex,
      lines: d.lines,
      left,
      right: d.right,
      maxRight,
      lineGap: gaps.length ? median(gaps) : fontSize * 1.2,
      fontSize,
      spaceBelow: Math.max(0, spaceBelow),
      soft,
    };
  });
}
