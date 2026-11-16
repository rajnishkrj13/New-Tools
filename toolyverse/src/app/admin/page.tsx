import Link from 'next/link';
import { count, eq, gt } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { TOOLS } from '@/lib/tools/registry';
import { allToolStates } from '@/lib/tools/settings';

async function loadStats() {
  const d = await db();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 864e5);
  return Promise.all([
    d.select({ n: count() }).from(schema.users),
    d.select({ n: count() }).from(schema.users).where(eq(schema.users.role, 'admin')),
    d.select({ n: count() }).from(schema.users).where(gt(schema.users.createdAt, weekAgo)),
    d.select({ n: count() }).from(schema.sessions).where(gt(schema.sessions.expiresAt, now)),
    allToolStates(),
  ]);
}

export default async function AdminHome() {
  const [[users], [admins], [newUsers], [active], states] = await loadStats();
  const all = [...states.values()];
  const stats: [string, number | string][] = [
    ['Users', users.n],
    ['New this week', newUsers.n],
    ['Admins', admins.n],
    ['Signed-in sessions', active.n],
    ['Tools on', `${all.filter((s) => s.enabled).length} / ${TOOLS.length}`],
    ['Members-only tools', all.filter((s) => s.enabled && s.access === 'members').length],
  ];
  return (
    <div>
      <h1 className="display text-[2.4rem]">Overview</h1>
      <dl className="mt-6 grid grid-cols-2 border-l border-t border-ink sm:grid-cols-3">
        {stats.map(([k, v]) => (
          <div key={k} className="border-b border-r border-ink bg-card px-4 py-3">
            <dt className="label">{k}</dt>
            <dd className="display mt-1 text-[2rem] tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-ink-2">
        Turn tools on or off, choose who may use them and set file limits under{' '}
        <Link href="/admin/tools" className="underline underline-offset-2">
          Tools &amp; features
        </Link>
        . Changes apply to the live site straight away.
      </p>
    </div>
  );
}
