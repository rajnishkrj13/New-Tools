'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getViewer, SESSION_COOKIE } from '@/lib/auth/session';
import { hashPassword, sha256, verifyPassword } from '@/lib/auth/password';
import { db, schema } from '@/lib/db';

export async function deleteMyData() {
  const viewer = await getViewer();
  if (!viewer) return;
  await (await db()).delete(schema.userData).where(eq(schema.userData.userId, viewer.id));
  revalidatePath('/account');
}

export async function changePassword(_: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const viewer = await getViewer();
  if (!viewer) return { error: 'Please log in again.' };
  const current = String(form.get('current') ?? '');
  const next = String(form.get('next') ?? '');
  if (next.length < 8) return { error: 'Use at least 8 characters for the new password.' };
  const d = await db();
  const [user] = await d.select().from(schema.users).where(eq(schema.users.id, viewer.id)).limit(1);
  if (!user || !(await verifyPassword(current, user.passwordHash))) return { error: 'Your current password is not right.' };
  await d.update(schema.users).set({ passwordHash: await hashPassword(next) }).where(eq(schema.users.id, viewer.id));
  // Sign out every other device; this one stays signed in.
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? '';
  await d.delete(schema.sessions).where(and(eq(schema.sessions.userId, viewer.id), ne(schema.sessions.id, sha256(token))));
  return { ok: true };
}
