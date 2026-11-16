import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { and, eq, gt } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { newToken, sha256 } from './password';

export const SESSION_COOKIE = 'tv_session';
const DAYS = 30;

export type Viewer = { id: string; email: string; name: string; role: 'admin' | 'user' } | null;

/** Starts a session for a user and sets the cookie. Call from a Server Action. */
export async function createSession(userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + DAYS * 864e5);
  const d = await db();
  await d.insert(schema.sessions).values({ id: sha256(token), userId, expiresAt });
  await d.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, userId));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await (await db()).delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

/** Who is looking at this page: a signed-in user or null. Read once per request. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const d = await db();
  const rows = await d
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role, disabled: schema.users.disabled })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || row.disabled) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
});

export async function requireAdmin() {
  const viewer = await getViewer();
  if (viewer?.role !== 'admin') {
    const { notFound } = await import('next/navigation');
    notFound();
  }
  return viewer!;
}
