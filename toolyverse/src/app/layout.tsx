import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from 'next/font/google';
import { headers } from 'next/headers';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getViewer } from '@/lib/auth/session';
import { SITE } from '@/lib/config';
import { getSiteSetting } from '@/lib/site';
import { allToolStates } from '@/lib/tools/settings';
import './globals.css';

const plexSans = IBM_Plex_Sans({ variable: '--font-plex-sans', subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' });
const plexCondensed = IBM_Plex_Sans_Condensed({ variable: '--font-plex-condensed', subsets: ['latin'], weight: ['500', '600', '700'], display: 'swap' });
const plexMono = IBM_Plex_Mono({ variable: '--font-plex-mono', subsets: ['latin'], weight: ['400', '600'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} – ${SITE.tagline}`, template: `%s | ${SITE.name}` },
  description:
    'Free online tools that run in your browser: edit, merge and compress PDFs, compress and resize images, calculate GST, make GST invoices and convert units.',
  applicationName: SITE.name,
  openGraph: { type: 'website', siteName: SITE.name, locale: SITE.locale },
  twitter: { card: 'summary_large_image' },
  formatDetection: { telephone: false },
  // Search Console / Bing Webmaster ownership tags, from the environment (see .env.example).
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION } : undefined,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f1ea' },
    { media: '(prefers-color-scheme: dark)', color: '#15130f' },
  ],
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const [viewer, announcement, states, head] = await Promise.all([getViewer(), getSiteSetting('announcement'), allToolStates(), headers()]);
  const hidden = new Set([...states.values()].filter((s) => !s.enabled).map((s) => s.slug));
  // Pages written in Hindi are marked by src/proxy.ts.
  const lang = head.get('x-page-lang') === 'hi-IN' ? 'hi-IN' : 'en-IN';
  return (
    // Browser extensions (dark-mode ones, for example) add styles to <html> before React loads;
    // ignore attribute differences on this one element only.
    <html lang={lang} className={`${plexSans.variable} ${plexCondensed.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
          Skip to content
        </a>
        <SiteHeader viewer={viewer} announcement={announcement} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter hidden={hidden} />
      </body>
    </html>
  );
}
