import regular from '@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf?url';
import italic from '@expo-google-fonts/noto-sans/400Regular_Italic/NotoSans_400Regular_Italic.ttf?url';
import bold from '@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf?url';
import boldItalic from '@expo-google-fonts/noto-sans/700Bold_Italic/NotoSans_700Bold_Italic.ttf?url';
import { FALLBACK_CSS_NAME, setBundledFontLoader } from './FontManager';

/**
 * Noto Sans (SIL Open Font License) ships with the app, served from the app's own origin.
 * It is the fallback for characters the standard PDF fonts cannot draw (for example the
 * rupee sign, Cyrillic, Greek, Devanagari) and can also be chosen as a normal font.
 */
const urls = [regular, bold, italic, boldItalic]; // index = (bold ? 1 : 0) + (italic ? 2 : 0)

export function installBundledFonts(onReady: () => void) {
  setBundledFontLoader(async (b, i) => {
    const res = await fetch(urls[(b ? 1 : 0) + (i ? 2 : 0)]);
    if (!res.ok) throw new Error('The bundled Unicode font could not be loaded.');
    return new Uint8Array(await res.arrayBuffer());
  });
  if (typeof FontFace === 'undefined') return;
  const faces = urls.map(
    (url, k) => new FontFace(FALLBACK_CSS_NAME, `url("${url}")`, { weight: k & 1 ? '700' : '400', style: k & 2 ? 'italic' : 'normal' }),
  );
  faces.forEach((f) => document.fonts.add(f));
  // Load in the background so text set in this font is measured with its real metrics.
  setTimeout(() => {
    Promise.all(faces.map((f) => f.load()))
      .then(onReady)
      .catch(() => undefined);
  }, 800);
}
