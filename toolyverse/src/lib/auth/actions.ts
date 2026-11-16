'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { getSiteSetting } from '@/lib/site';
import { hashPassword, newId, verifyPassword } from './password';
import { createSession, endSession } from './session';

export type FormState = { error?: string; fields?: Record<string, string> } | undefined;

// A small brake on password guessing: 8 failed tries per address per 15 minutes.
const attempts = new Map<string, { n: number; until: number }>();
function tooMany(key: string) {
  const a = attempts.get(key);
  return !!a && a.until > Date.now() && a.n >= 8;
}
function failed(key: string) {
  const a = attempts.get(key);
  if (!a || a.until < Date.now()) attempts.set(key, { n: 1, until: Date.now() + 15 * 60_000 });
  else a.n++;
}

const safeNext = (v: FormDataEntryValue | null) => {
  const s = typeof v === 'string' ? v : '';
  return s.startsWith('/') && !s.startsWith('//') ? s : '/account';
};

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(80),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.').max(160),
  password: z.string().min(8, 'Use at least 8 characters for your password.').max(200),
});

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({ name: form.get('name'), email: form.get('email'), password: form.get('password') });
  const fields = { name: String(form.get('name') ?? ''), email: String(form.get('email') ?? '') };
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  if ((await getSiteSetting('signupsOpen')) === false) return { error: 'New sign-ups are paused at the moment. Please try again later.', fields };
  const d = await db();
  const existing = await d.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, parsed.data.email)).limit(1);
  if (existing.length) return { error: 'An account with this email already exists. Log in instead.', fields };
  // The very first account on a fresh install becomes the super admin.
  const [{ value: total }] = await d.select({ value: count() }).from(schema.users);
  const id = newId();
  await d.insert(schema.users).values({
    id,
    email: parsed.data.email,
    name: parsed.data.name,
    passwordHash: await hashPassword(parsed.data.password),
    role: total === 0 ? 'superadmin' : 'user',
  });
  await createSession(id);
  redirect(safeNext(form.get('next')));
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const key = `${ip}|${email}`;
  if (tooMany(key)) return { error: 'Too many attempts. Please wait 15 minutes and try again.', fields: { email } };
  const d = await db();
  const [user] = await d.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  // The same message whether the email or the password was wrong, so accounts cannot be probed.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    failed(key);
    return { error: 'That email and password do not match.', fields: { email } };
  }
  if (user.disabled) return { error: 'This account has been suspended. Contact us if you think this is a mistake.', fields: { email } };
  attempts.delete(key);
  await createSession(user.id);
  redirect(safeNext(form.get('next')));
}

export async function logout() {
  await endSession();
  redirect('/');
}
