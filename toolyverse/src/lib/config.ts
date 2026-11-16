/** Public site facts, safe to use on the server and in the browser. */
export const SITE = {
  name: 'Toolyverse',
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  tagline: 'Free online tools for PDFs, images, GST and everyday conversions',
  locale: 'en_IN',
  /** Social profiles of the brand (comma-separated in NEXT_PUBLIC_SITE_SAME_AS), for search engines. */
  sameAs: (process.env.NEXT_PUBLIC_SITE_SAME_AS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
};
