/** Browser-side image work: decode, draw, encode and squeeze to a target size. */

export type OutType = 'image/jpeg' | 'image/png' | 'image/webp';

export const EXT: Record<OutType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This file could not be read as an image. Use JPG, PNG or WebP.');
  }
}

export function drawCanvas(src: CanvasImageSource, w: number, h: number, background?: string, crop?: { x: number; y: number; w: number; h: number }) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d')!;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (crop) ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
  else ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function encode(canvas: HTMLCanvasElement, type: OutType, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not save this image.'))), type, type === 'image/png' ? undefined : quality),
  );
}

/** JPG has no transparency: anything transparent becomes this colour. */
export const needsBackground = (type: OutType) => type === 'image/jpeg';

/**
 * The best quality that fits in `target` bytes, found by halving the quality range. When even
 * the lowest sensible quality is too big and `shrink` is allowed, the picture is made smaller.
 */
export async function squeeze(
  bitmap: ImageBitmap,
  type: Exclude<OutType, 'image/png'>,
  target: number,
  shrink: boolean,
): Promise<{ blob: Blob; quality: number; width: number; height: number; reached: boolean }> {
  let scale = 1;
  // Below this quality JPEG blocks show; a slightly smaller picture at a good quality looks better.
  const GOOD = 0.45;
  let fallback: { blob: Blob; quality: number; width: number; height: number; reached: boolean } | null = null;
  for (let round = 0; round < 12; round++) {
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = drawCanvas(bitmap, w, h, needsBackground(type) ? '#ffffff' : undefined);
    let lo = 0.05;
    let hi = 0.95;
    let best: Blob | null = null;
    let bestQ = lo;
    for (let i = 0; i < 8; i++) {
      const q = (lo + hi) / 2;
      const blob = await encode(canvas, type, q);
      if (blob.size <= target) {
        best = blob;
        bestQ = q;
        lo = q;
      } else hi = q;
    }
    if (!best) {
      const smallest = await encode(canvas, type, 0.05);
      if (smallest.size <= target) {
        best = smallest;
        bestQ = 0.05;
      }
    }
    if (best) {
      const found = { blob: best, quality: bestQ, width: w, height: h, reached: true };
      if (!shrink || bestQ >= GOOD) return found;
      fallback ??= found;
      // Stop once the picture is getting small; then take the best-looking result so far.
      if (Math.max(w, h) < 640) return found;
      scale *= 0.8;
      continue;
    }
    if (fallback) return fallback;
    if (!shrink) {
      const blob = await encode(canvas, type, 0.05);
      return { blob, quality: 0.05, width: w, height: h, reached: false };
    }
    scale *= 0.8;
  }
  const canvas = drawCanvas(bitmap, bitmap.width * scale, bitmap.height * scale, '#ffffff');
  const blob = await encode(canvas, type, 0.05);
  return { blob, quality: 0.05, width: canvas.width, height: canvas.height, reached: blob.size <= target };
}

/** Re-encodes a JPEG from inside a PDF at a smaller size (used by Compress PDF). */
export async function recodeJpeg(jpeg: Uint8Array, level: { maxSide: number; quality: number }) {
  const bitmap = await createImageBitmap(new Blob([jpeg.slice().buffer], { type: 'image/jpeg' }));
  try {
    const scale = Math.min(1, level.maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = drawCanvas(bitmap, bitmap.width * scale, bitmap.height * scale, '#ffffff');
    const blob = await encode(canvas, 'image/jpeg', level.quality);
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}

/** A picture ready for pdf-lib: JPG and PNG as they are, anything else converted to PNG. */
export async function toPdfPicture(file: File): Promise<{ bytes: Uint8Array; mime: 'image/png' | 'image/jpeg'; width: number; height: number }> {
  const bitmap = await loadBitmap(file);
  try {
    const type = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name) ? 'image/jpeg' : file.type === 'image/png' || /\.png$/i.test(file.name) ? 'image/png' : null;
    // Camera photos carry an EXIF rotation that pdf-lib ignores, so JPEGs are redrawn upright.
    const blob = type === 'image/png' ? file : await encode(drawCanvas(bitmap, bitmap.width, bitmap.height, '#ffffff'), type ?? 'image/jpeg', 0.92);
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: type === 'image/png' ? 'image/png' : 'image/jpeg', width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export const outTypeFor = (file: File): OutType => (file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg');
