import { cssFamily } from '../engines/FontManager';

export interface FontSpec {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
}

type MeasureImpl = (text: string, cssFont: string, fontSize: number) => number;

let ctx: CanvasRenderingContext2D | null = null;
let impl: MeasureImpl = (text, font) => {
  ctx ??= document.createElement('canvas').getContext('2d')!;
  ctx.font = font;
  return ctx.measureText(text).width;
};

/** Lets tests (no canvas in Node) plug in their own text measurement. */
export const setMeasureImpl = (fn: MeasureImpl) => {
  impl = fn;
};

export const cssFont = (s: FontSpec): string =>
  `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}${s.fontSize}px ${cssFamily(s.fontFamily)}`;

/** Text width in points. Measured at 100px and scaled, so small sizes are not rounded. */
export function measureText(text: string, spec: FontSpec): number {
  if (!text) return 0;
  return (impl(text, cssFont({ ...spec, fontSize: 100 }), 100) * spec.fontSize) / 100;
}

/** Distance from the top of a text box to the first baseline, and line height, in em. */
export const BASELINE_EM = 0.94;
export const LINE_HEIGHT_EM = 1.2;
