import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { DEFAULT_ADMIN_PERMISSIONS, type AdminPermissions } from '@/lib/auth/roles';

/** Site-wide switches the admin controls. */
export const SITE_DEFAULTS = {
  signupsOpen: true as boolean,
  announcement: '' as string,
  /** What admins (not super admins) may do in the admin panel. */
  adminPermissions: DEFAULT_ADMIN_PERMISSIONS as AdminPermissions,
};
export type SiteKey = keyof typeof SITE_DEFAULTS;

export async function getSiteSetting<K extends SiteKey>(key: K): Promise<(typeof SITE_DEFAULTS)[K]> {
  const d = await db();
  const [row] = await d.select().from(schema.siteSettings).where(eq(schema.siteSettings.key, key)).limit(1);
  const def = SITE_DEFAULTS[key];
  if (!row) return def;
  // Objects keep new defaults for keys added after they were saved.
  return (def && typeof def === 'object' ? { ...def, ...(row.value as object) } : row.value) as (typeof SITE_DEFAULTS)[K];
}

export async function setSiteSetting<K extends SiteKey>(key: K, value: (typeof SITE_DEFAULTS)[K]) {
  const d = await db();
  await d.insert(schema.siteSettings).values({ key, value }).onConflictDoUpdate({ target: schema.siteSettings.key, set: { value } });
}
