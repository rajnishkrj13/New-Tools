import { ImageResponse } from 'next/og';

export const alt = 'Toolyverse: free PDF editor and online tools';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The picture shown when the home page or an info page is shared (tools have their own). */
export default function Image() {
  const drawers: [string, string][] = [
    ['PDF', '#c0402b'],
    ['Images', '#2a6a8a'],
    ['GST', '#2c6a45'],
    ['Converters', '#8a5d16'],
  ];
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#f4f1ea', padding: 64, fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, background: '#1b1915', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f4f1ea', fontSize: 30, fontWeight: 700 }}>T</div>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: '#1b1915' }}>
            <span>Tooly</span>
            <span style={{ color: '#d4452a' }}>verse</span>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 24, color: '#777064', letterSpacing: 3 }}>TOOLYVERSE.COM</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', borderTop: '4px solid #1b1915', paddingTop: 28 }}>
          <div style={{ display: 'flex', fontSize: 80, fontWeight: 700, color: '#1b1915', lineHeight: 1.02, letterSpacing: -2 }}>Free PDF editor and online tools</div>
          <div style={{ display: 'flex', fontSize: 34, color: '#47433b', marginTop: 18 }}>Edit, sign and compress PDFs, shrink photos for forms, work out GST.</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 34 }}>
            {drawers.map(([name, color]) => (
              <div key={name} style={{ display: 'flex', fontSize: 24, color: '#f4f1ea', background: color, padding: '8px 18px' }}>
                {name}
              </div>
            ))}
            <div style={{ display: 'flex', marginLeft: 'auto', fontSize: 24, color: '#777064', alignItems: 'center' }}>Free · No upload · No watermark</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
