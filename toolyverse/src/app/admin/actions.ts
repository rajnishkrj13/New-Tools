'use server';

import { revalidatePath } from 'next/cache';
import { and, count, eq, ne } from 'drizzle-orm';
import { AREAS, asRole, type AdminPermissions } from '@/lib/auth/roles';
import { requireArea } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { setSiteSetting } from '@/lib/site';
import { toolBySlug } from '@/lib/tools/registry';
import { defaultState, saveToolState, toolState } from '@/lib/tools/settings';

// Every action checks the viewer's role itself: a Server Action is a public endpoint.

export async function saveTool(form: FormData) {
  await requireArea('tools');
  const slug = String(form.get('slug'));
  const tool = toolBySlug.get(slug);
  if (!tool) return;
  const current = (await toolState(slug)) ?? defaultState(tool);
  const mb = (k: string, fallback: number) => {
    const n = Math.round(Number(form.get(k)));
    return Number.isFinite(n) && n >= 1 && n <= 2000 ? n : fallback;
  };
  await saveToolState({
    slug,
    enabled: form.get('enabled') === 'on',
    access: form.get('access') === 'members' ? 'members' : 'public',
    features: Object.fromEntries((tool.features ?? []).map((f) => [f.key, form.get(`f:${f.key}`) === 'on'])),
    limits: current.limits && { publicMb: mb('publicMb', current.limits.publicMb), memberMb: mb('memberMb', current.limits.memberMb) },
  });
  revalidatePath('/', 'layout');
}

export async function resetTool(form: FormData) {
  await requireArea('tools');
  const tool = toolBySlug.get(String(form.get('slug')));
  if (!tool) return;
  await saveToolState(defaultState(tool));
  revalidatePath('/', 'layout');
}

async function activeSuperAdmins(exceptId?: string) {
  const d = await db();
  const where = exceptId
    ? and(eq(schema.users.role, 'superadmin'), eq(schema.users.disabled, false), ne(schema.users.id, exceptId))
    : and(eq(schema.users.role, 'superadmin'), eq(schema.users.disabled, false));
  const [{ value }] = await d.select({ value: count() }).from(schema.users).where(where);
  return value;
}

/** Super admins only: change anyone's role. The site always keeps at least one active super admin. */
export async function setUserRole(form: FormData) {
  await requireArea('roles');
  const id = String(form.get('id'));
  const role = asRole(form.get('role'));
  const d = await db();
  const [target] = await d.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!target) return;
  if (target.role === 'superadmin' && role !== 'superadmin' && (await activeSuperAdmins(id)) === 0) return;
  await d.update(schema.users).set({ role }).where(eq(schema.users.id, id));
  revalidatePath('/admin', 'layout');
}

/**
 * Suspend or restore an account. Admins may do this to members only; super admins to anyone
 * except themselves and the last active super admin.
 */
export async function setUserDisabled(form: FormData) {
  const { viewer } = await requireArea('users');
  const id = String(form.get('id'));
  if (id === viewer.id) return;
  const d = await db();
  const [target] = await d.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!target) return;
  if (viewer.role !== 'superadmin' && target.role !== 'user') return;
  const disabled = form.get('disabled') === 'true';
  if (disabled && target.role === 'superadmin' && (await activeSuperAdmins(id)) === 0) return;
  await d.update(schema.users).set({ disabled }).where(eq(schema.users.id, id));
  if (disabled) await d.delete(schema.sessions).where(eq(schema.sessions.userId, id));
  revalidatePath('/admin/users');
}

export async function saveSite(form: FormData) {
  await requireArea('site');
  await setSiteSetting('signupsOpen', form.get('signupsOpen') === 'on');
  await setSiteSetting('announcement', String(form.get('announcement') ?? '').trim().slice(0, 200));
  revalidatePath('/', 'layout');
}

/** Super admins only: which parts of the admin panel admins may use. */
export async function saveAdminPermissions(form: FormData) {
  await requireArea('roles');
  const perms = Object.fromEntries(AREAS.map((a) => [a, form.get(a) === 'on'])) as AdminPermissions;
  await setSiteSetting('adminPermissions', perms);
  revalidatePath('/admin', 'layout');
}
