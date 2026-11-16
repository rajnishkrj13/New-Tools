import 'server-only';
import path from 'node:path';
import * as schema from './schema';

/**
 * The database. With DATABASE_URL set to a postgres:// address it connects to that server;
 * without it (development) it runs PGlite, the real Postgres engine embedded in Node, with its
 * files in ./.data/pglite. Migrations from ./drizzle are applied once on first use.
 */

type Db = Awaited<ReturnType<typeof connect>>;

async function connect() {
  const url = process.env.DATABASE_URL;
  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL ?? 10) });
    const db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder });
    return db as unknown as ReturnType<typeof import('drizzle-orm/node-postgres').drizzle<typeof schema>>;
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const dir = url?.startsWith('pglite:') ? url.slice(7) : path.join(process.cwd(), '.data', 'pglite');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  try {
    await client.waitReady;
  } catch (e) {
    // Development only: a PGlite folder can be left unreadable when the dev server is killed
    // mid-write. It cannot be moved while this process holds it, so say how to recover.
    throw new Error(
      `The local development database in ${dir} could not be opened (${(e as Error).message}). ` +
        'Stop the dev server, rename or delete that folder, and start again; then sign up again (the first account becomes super admin).',
    );
  }
  // Close cleanly when the dev server stops, so the files are not left half-written.
  const g2 = globalThis as unknown as { __tvPgliteClose?: boolean };
  if (!g2.__tvPgliteClose) {
    g2.__tvPgliteClose = true;
    // Listening for a signal replaces Node's default exit, so exit once the database is closed.
    for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => void client.close().finally(() => process.exit(0)));
  }
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder });
  // Both drivers expose the same query builder; the app only uses that common surface.
  return db as unknown as ReturnType<typeof import('drizzle-orm/node-postgres').drizzle<typeof schema>>;
}

/**
 * Installs from before the super admin role existed: the earliest admin becomes super admin,
 * so there is always someone who can manage roles.
 */
async function ensureSuperAdmin(d: Db) {
  const { sql } = await import('drizzle-orm');
  await d.execute(sql`
    UPDATE users SET role = 'superadmin'
    WHERE id = (SELECT id FROM users WHERE role = 'admin' AND NOT disabled ORDER BY created_at LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'superadmin')`);
}

// Kept on globalThis so hot reloads in development reuse one connection.
const g = globalThis as unknown as { __tvDb?: Promise<Db> };

export function db(): Promise<Db> {
  if (!g.__tvDb) {
    g.__tvDb = connect()
      .then(async (d) => {
        await ensureSuperAdmin(d);
        return d;
      })
      .catch((e) => {
      g.__tvDb = undefined;
      throw e;
    });
  }
  return g.__tvDb;
}

export { schema };
