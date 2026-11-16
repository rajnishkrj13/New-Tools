'use server';

import { revalidatePath } from 'next/cache';
import { and, count, eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { setSiteSetting } from '@/lib/site';
import { toolBySlug } from '@/lib/tools/registry';
import { defaultState, saveToolState, toolState } from '@/lib/tools/settings';

// Every action checks the session itself: a Server Action is a public endpoint.

export async function saveTool(form: FormData) {
  await requireAdmin();
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
  await requireAdmin();
  const tool = toolBySlug.get(String(form.get('slug')));
  if (!tool) return;
  await saveToolState(defaultState(tool));
  revalidatePath('/', 'layout');
}

export async function setUserRole(form: FormData) {
  const me = await requireAdmin();
  const id = String(form.get('id'));
  const role = form.get('role') === 'admin' ? 'admin' : 'user';
  if (id === me.id && role !== 'admin') {
    // Never leave the site without an administrator.
    const [{ value }] = await (await db()).select({ value: count() }).from(schema.users).where(eq(schema.users.role, 'admin'));
    if (value <= 1) return;
  }
  await (await db()).update(schema.users).set({ role }).where(eq(schema.users.id, id));
  revalidatePath('/admin/users');
}

export async function setUserDisabled(form: FormData) {
  const me = await requireAdmin();
  const id = String(form.get('id'));
  if (id === me.id) return;
  const disabled = form.get('disabled') === 'true';
  const d = await db();
  await d.update(schema.users).set({ disabled }).where(and(eq(schema.users.id, id)));
  if (disabled) await d.delete(schema.sessions).where(eq(schema.sessions.userId, id));
  revalidatePath('/admin/users');
}

export async function saveSite(form: FormData) {
  await requireAdmin();
  await setSiteSetting('signupsOpen', form.get('signupsOpen') === 'on');
  await setSiteSetting('announcement', String(form.get('announcement') ?? '').trim().slice(0, 200));
  revalidatePath('/', 'layout');
}
