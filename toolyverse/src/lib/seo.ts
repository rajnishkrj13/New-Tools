import type { Metadata } from 'next';
import { SITE } from '@/lib/config';

/**
 * Metadata for a page that is not a tool: its canonical address, and a share preview with
 * the page's own address and the site picture (app/opengraph-image.tsx).
 */
export function pageMeta(o: { title: string; description: string; path: string; absoluteTitle?: boolean }): Metadata {
  const image = { url: '/opengraph-image', width: 1200, height: 630, alt: SITE.name };
  return {
    title: o.absoluteTitle ? { absolute: o.title } : o.title,
    description: o.description,
    alternates: { canonical: o.path },
    openGraph: { title: o.title, description: o.description, url: o.path, type: 'website', siteName: SITE.name, locale: SITE.locale, images: [image] },
    twitter: { card: 'summary_large_image', title: o.title, description: o.description, images: [image.url] },
  };
}
