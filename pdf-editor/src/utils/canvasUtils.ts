import type { Rect } from '../types/pdf';
import { pageCanvases } from '../engines/PdfRenderer';

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/**
 * Reads the paper colour and the ink colour of a text area from the rendered page, so
 * the cover drawn over edited text and the replacement text match the document.
 * `rect` is in view space. Falls back to black on white when the page is not rendered.
 */
export function samplePageColors(pageId: string, rect: Rect, pageWidth: number): { background: string; text: string } {
  const fallback = { background: '#ffffff', text: '#000000' };
  const canvas = pageCanvases.get(pageId);
  if (!canvas || !canvas.width) return fallback;
  try {
    const k = canvas.width / pageWidth;
    const x = Math.max(0, Math.floor((rect.x - 1) * k));
    const y = Math.max(0, Math.floor((rect.y - 1) * k));
    const w = Math.min(canvas.width - x, Math.ceil((rect.width + 2) * k));
    const h = Math.min(canvas.height - y, Math.ceil((rect.height + 2) * k));
    if (w < 2 || h < 2) return fallback;
    const data = canvas.getContext('2d')!.getImageData(x, y, w, h).data;
    // Background: the most frequent colour on the border of the area.
    const counts = new Map<number, number>();
    const vote = (px: number, py: number) => {
      const i = (py * w + px) * 4;
      const key = ((data[i] >> 2) << 12) | ((data[i + 1] >> 2) << 6) | (data[i + 2] >> 2);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    };
    for (let px = 0; px < w; px++) {
      vote(px, 0);
      vote(px, h - 1);
    }
    for (let py = 0; py < h; py++) {
      vote(0, py);
      vote(w - 1, py);
    }
    let best = 0;
    let bestCount = -1;
    for (const [key, c] of counts) if (c > bestCount) [best, bestCount] = [key, c];
    const bg = [((best >> 12) & 63) << 2, ((best >> 6) & 63) << 2, (best & 63) << 2].map((v) => (v >= 248 ? 255 : v));
    // Ink: the colour farthest from the background (the core of the glyph strokes).
    let far = 0;
    let ink = [0, 0, 0];
    const step = Math.max(1, Math.floor((w * h) / 40000));
    for (let p = 0; p < w * h; p += step) {
      const i = p * 4;
      const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
      if (d > far) {
        far = d;
        ink = [data[i], data[i + 1], data[i + 2]];
      }
    }
    return { background: hex(bg[0], bg[1], bg[2]), text: far > 60 ? hex(ink[0], ink[1], ink[2]) : '#000000' };
  } catch {
    return fallback;
  }
}
