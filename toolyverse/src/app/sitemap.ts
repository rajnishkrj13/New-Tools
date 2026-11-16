import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/config';
import { CATEGORIES, TOOLS, categoryPath, toolPath } from '@/lib/tools/registry';
import { allToolStates } from '@/lib/tools/settings';

// Built per request so tools the admin switches off drop out at once.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const states = await allToolStates();
  const now = new Date();
  return [
    { url: `${SITE.url}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...CATEGORIES.map((c) => ({ url: `${SITE.url}${categoryPath(c)}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...TOOLS.filter((t) => states.get(t.slug)?.enabled).map((t) => ({
      url: `${SITE.url}${toolPath(t)}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    })),
    ...['about', 'privacy', 'terms', 'contact'].map((p) => ({ url: `${SITE.url}/${p}`, changeFrequency: 'yearly' as const, priority: 0.3 })),
  ];
}
