import { ImageResponse } from 'next/og';
import { categoryById, categoryBySlug, toolBySlug, toolNo } from '@/lib/tools/registry';

export const alt = 'Toolyverse';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const ACCENT: Record<string, string> = { pdf: '#c0402b', image: '#2a6a8a', gst: '#2c6a45', convert: '#8a5d16' };

/** The picture shown when a tool or drawer is shared on WhatsApp, X or LinkedIn. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = toolBySlug.get(slug);
  const cat = tool ? categoryById.get(tool.category) : categoryBySlug.get(slug);
  const title = tool?.h1 ?? cat?.name ?? 'Toolyverse';
  const line = tool?.short ?? cat?.blurb ?? '';
  const accent = ACCENT[cat?.id ?? 'pdf'];
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#f4f1ea', padding: 64, fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, background: '#1b1915', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f4f1ea', fontSize: 30, fontWeight: 700 }}>T</div>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: '#1b1915' }}>
            <span>Tooly</span>
            <span style={{ color: '#d4452a' }}>verse</span>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 24, color: accent, letterSpacing: 3 }}>{tool ? `No. ${toolNo(tool)} · ${cat?.name.toUpperCase()}` : 'DRAWER'}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', borderTop: '4px solid #1b1915', paddingTop: 28 }}>
          <div style={{ display: 'flex', fontSize: 86, fontWeight: 700, color: '#1b1915', lineHeight: 1.02, letterSpacing: -2 }}>{title}</div>
          <div style={{ display: 'flex', fontSize: 34, color: '#47433b', marginTop: 18 }}>{line}</div>
          <div style={{ display: 'flex', gap: 28, marginTop: 34, fontSize: 24, color: '#777064' }}>
            <span>Free</span>
            <span>·</span>
            <span>No upload</span>
            <span>·</span>
            <span>No watermark</span>
          </div>
        </div>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 220, height: 14, background: accent }} />
      </div>
    ),
    size,
  );
}
