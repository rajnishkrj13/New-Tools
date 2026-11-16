import { describe, expect, it } from 'vitest';
import { asRole, canAccess, DEFAULT_ADMIN_PERMISSIONS, isStaff } from '../src/lib/auth/roles';

describe('roles', () => {
  const perms = { tools: true, users: false, site: false };

  it('gives super admins every area, including roles', () => {
    for (const a of ['overview', 'tools', 'users', 'site', 'roles'] as const) expect(canAccess('superadmin', a, perms)).toBe(true);
  });

  it('gives admins only what the super admin allowed, and never roles', () => {
    expect(canAccess('admin', 'overview', perms)).toBe(true);
    expect(canAccess('admin', 'tools', perms)).toBe(true);
    expect(canAccess('admin', 'users', perms)).toBe(false);
    expect(canAccess('admin', 'site', perms)).toBe(false);
    expect(canAccess('admin', 'roles', { tools: true, users: true, site: true })).toBe(false);
  });

  it('keeps members and visitors out of the admin panel', () => {
    expect(canAccess('user', 'overview', DEFAULT_ADMIN_PERMISSIONS)).toBe(false);
    expect(canAccess(null, 'overview', DEFAULT_ADMIN_PERMISSIONS)).toBe(false);
    expect(isStaff('user')).toBe(false);
    expect(isStaff('admin')).toBe(true);
  });

  it('treats unknown role values as an ordinary member', () => {
    expect(asRole('owner')).toBe('user');
    expect(asRole('superadmin')).toBe('superadmin');
  });
});
