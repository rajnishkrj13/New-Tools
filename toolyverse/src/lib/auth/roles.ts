/**
 * Roles, from most to least power:
 *  - superadmin: everything, and the only role that changes roles or decides what admins may do;
 *  - admin: the admin areas the super admin allows;
 *  - user: a signed-in member;
 *  (visitors without an account are "public" and have no row at all).
 */

export const ROLES = ['superadmin', 'admin', 'user'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = { superadmin: 'Super admin', admin: 'Admin', user: 'Member' };

/** Parts of the admin panel. "roles" (roles and permissions) is for super admins only. */
export const AREAS = ['tools', 'users', 'site'] as const;
export type Area = (typeof AREAS)[number] | 'overview' | 'roles';

export const AREA_INFO: Record<(typeof AREAS)[number], { label: string; hint: string }> = {
  tools: { label: 'Tools & features', hint: 'Switch tools on or off, members-only, file limits and feature switches' },
  users: { label: 'Users', hint: 'See members, suspend and restore member accounts (never admins)' },
  site: { label: 'Site settings', hint: 'Open or close sign-ups, the announcement bar' },
};

export type AdminPermissions = Record<(typeof AREAS)[number], boolean>;
export const DEFAULT_ADMIN_PERMISSIONS: AdminPermissions = { tools: true, users: true, site: false };

export const isStaff = (role?: Role | null) => role === 'superadmin' || role === 'admin';

/** What a role may open in the admin panel, given the super admin's choices for admins. */
export function canAccess(role: Role | undefined | null, area: Area, perms: AdminPermissions): boolean {
  if (role === 'superadmin') return true;
  if (role !== 'admin') return false;
  if (area === 'overview') return true;
  if (area === 'roles') return false;
  return !!perms[area];
}

export const asRole = (v: unknown): Role => (ROLES.includes(v as Role) ? (v as Role) : 'user');
