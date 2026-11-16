import { and, eq } from 'drizzle-orm';
import { getViewer } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';

/**
 * Small things a signed-in user keeps across devices (saved signatures, invoice details).
 * Only known keys are accepted, each with a size cap.
 */
const KEYS: Record<string, number> = {
  'gst-invoice-business': 16_000,
  'gstr2b-state-names': 40_000,
  'pdf-profile-details': 16_000,
  'pdf-profile-marks': 1_500_000,
  'pdf-profile-dateFormat': 100,
};

async function guard(key: string) {
  if (!(key in KEYS)) return { error: Response.json({ error: 'Unknown key' }, { status: 404 }) };
  const viewer = await getViewer();
  if (!viewer) return { error: Response.json({ error: 'Sign in first' }, { status: 401 }) };
  return { viewer };
}

export async function GET(_: Request, ctx: RouteContext<'/api/me/data/[key]'>) {
  const { key } = await ctx.params;
  const g = await guard(key);
  if (g.error) return g.error;
  const [row] = await (await db())
    .select({ value: schema.userData.value })
    .from(schema.userData)
    .where(and(eq(schema.userData.userId, g.viewer.id), eq(schema.userData.key, key)))
    .limit(1);
  return Response.json({ value: row?.value ?? null }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(req: Request, ctx: RouteContext<'/api/me/data/[key]'>) {
  const { key } = await ctx.params;
  const g = await guard(key);
  if (g.error) return g.error;
  // Same-site requests only: a page on another site cannot write into someone's account.
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.headers.get('host')) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const text = await req.text();
  if (text.length > KEYS[key]) return Response.json({ error: 'Too large' }, { status: 413 });
  let body: { value?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: 'Bad JSON' }, { status: 400 });
  }
  const d = await db();
  if (body.value === null || body.value === undefined) {
    await d.delete(schema.userData).where(and(eq(schema.userData.userId, g.viewer.id), eq(schema.userData.key, key)));
  } else {
    const values = { userId: g.viewer.id, key, value: body.value, updatedAt: new Date() };
    await d
      .insert(schema.userData)
      .values(values)
      .onConflictDoUpdate({ target: [schema.userData.userId, schema.userData.key], set: { value: body.value, updatedAt: new Date() } });
  }
  return Response.json({ ok: true });
}
