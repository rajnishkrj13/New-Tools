import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

/** Site-wide switches the admin controls. */
export const SITE_DEFAULTS = {
  signupsOpen: true as boolean,
  announcement: '' as string,
};
export type SiteKey = keyof typeof SITE_DEFAULTS;

export async function getSiteSetting<K extends SiteKey>(key: K): Promise<(typeof SITE_DEFAULTS)[K]> {
  const d = await db();
  const [row] = await d.select().from(schema.siteSettings).where(eq(schema.siteSettings.key, key)).limit(1);
  return (row ? row.value : SITE_DEFAULTS[key]) as (typeof SITE_DEFAULTS)[K];
}

export async function setSiteSetting<K extends SiteKey>(key: K, value: (typeof SITE_DEFAULTS)[K]) {
  const d = await db();
  await d.insert(schema.siteSettings).values({ key, value }).onConflictDoUpdate({ target: schema.siteSettings.key, set: { value } });
}
