import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/config';
import { CATEGORIES, CONTENT_UPDATED, TOOLS, categoryPath, toolPath } from '@/lib/tools/registry';
import { allToolStates } from '@/lib/tools/settings';

// Built per request so tools the admin switches off drop out at once.
export const dynamic = 'force-dynamic';

/**
 * Dates are when the page text last changed, not "now": search engines ignore a lastmod that
 * changes on every visit. Pages in two languages list each other (hreflang).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const states = await allToolStates();
  const site = new Date(CONTENT_UPDATED);
  const abs = (p: string) => `${SITE.url}${p}`;
  return [
    // The home page's canonical address has no trailing slash; the sitemap uses the same one.
    { url: SITE.url, lastModified: site, changeFrequency: 'weekly', priority: 1 },
    ...CATEGORIES.map((c) => ({ url: abs(categoryPath(c)), lastModified: site, changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...TOOLS.filter((t) => states.get(t.slug)?.enabled).map((t) => ({
      url: abs(toolPath(t)),
      lastModified: new Date(t.updated ?? CONTENT_UPDATED),
      changeFrequency: 'monthly' as const,
      // The PDF editor and its pages are what the site most wants found.
      priority: t.slug === 'pdf-editor' ? 1 : t.opens === 'pdf-editor' ? 0.9 : 0.8,
      ...(t.alternates
        ? { alternates: { languages: { [t.lang === 'hi' ? 'hi-IN' : 'en-IN']: abs(toolPath(t)), ...Object.fromEntries(Object.entries(t.alternates).map(([l, p]) => [l, abs(p)])) } } }
        : {}),
    })),
    ...['about', 'privacy', 'terms', 'contact'].map((p) => ({ url: abs(`/${p}`), lastModified: site, changeFrequency: 'yearly' as const, priority: 0.3 })),
  ];
}
