import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/config';

/** Lets phones "install" Toolyverse to the home screen; the PDF editor is the main entry. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} – PDF editor and everyday tools`,
    short_name: SITE.name,
    description: SITE.tagline,
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f1ea',
    theme_color: '#1b1915',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcuts: [
      { name: 'PDF Editor', url: '/pdf-editor' },
      { name: 'Sign PDF', url: '/sign-pdf' },
      { name: 'GST Calculator', url: '/gst-calculator' },
    ],
  };
}
