import 'server-only';
import path from 'node:path';
import * as schema from './schema';

/**
 * The database. With DATABASE_URL set to a postgres:// address it connects to that server;
 * without it (development) it runs PGlite, the real Postgres engine embedded in Node, saved to
 * ./.data/pglite.tar.gz. Migrations from ./drizzle are applied once on first use.
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
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const file = url?.startsWith('pglite:') ? url.slice(7) : path.join(process.cwd(), '.data', 'pglite.tar.gz');
  const client = await openSnapshotDb(file);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder });
  // Both drivers expose the same query builder; the app only uses that common surface.
  return db as unknown as ReturnType<typeof import('drizzle-orm/node-postgres').drizzle<typeof schema>>;
}

/**
 * Development database: PGlite runs in memory and is saved to one compressed snapshot file a
 * few seconds after each change. The snapshot is written to a temporary file and then swapped
 * in, so stopping the dev server at any moment (closing the app, a crash, a reboot) can lose
 * at most the last few seconds and never corrupts the database. PGlite's own on-disk mode is
 * not safe against being killed on Windows.
 */
async function openSnapshotDb(file: string) {
  const { PGlite } = await import('@electric-sql/pglite');
  const fs = await import('node:fs');
  fs.mkdirSync(path.dirname(file), { recursive: true });

  let loadDataDir: Blob | undefined;
  if (fs.existsSync(file)) loadDataDir = new Blob([fs.readFileSync(file)]);
  else {
    // A database from the older folder layout is carried over once, if it still opens.
    const oldDir = path.join(path.dirname(file), 'pglite');
    if (fs.existsSync(oldDir)) {
      try {
        const old = new PGlite(oldDir);
        await old.waitReady;
        loadDataDir = await old.dumpDataDir('gzip');
        await old.close();
      } catch {
        console.warn(`[db] The old development database in ${oldDir} could not be opened; starting a fresh one. Sign up again: the first account becomes super admin.`);
      }
    }
  }
  const client = new PGlite({ loadDataDir });
  await client.waitReady;

  let dirty = !fs.existsSync(file);
  let saving: Promise<void> | null = null;
  const save = async () => {
    if (!dirty || saving) return saving ?? undefined;
    dirty = false;
    saving = (async () => {
      const blob = await client.dumpDataDir('gzip');
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, new Uint8Array(await blob.arrayBuffer()));
      fs.renameSync(tmp, file);
    })()
      .catch((e) => {
        dirty = true;
        console.warn('[db] Could not save the development database snapshot:', (e as Error).message);
      })
      .finally(() => (saving = null));
    return saving;
  };

  // Anything that is not a plain read marks the database as changed.
  const c = client as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const name of ['query', 'exec', 'transaction'] as const) {
    const original = c[name].bind(client);
    c[name] = (...args: unknown[]) => {
      if (name !== 'query' || !/^\s*select\b/i.test(String(args[0]))) dirty = true;
      return original(...args);
    };
  }
  setInterval(() => void save(), 3000).unref();
  const g2 = globalThis as unknown as { __tvPgliteExit?: boolean };
  if (!g2.__tvPgliteExit) {
    g2.__tvPgliteExit = true;
    // Listening for a signal replaces Node's default exit, so exit once the last change is saved.
    for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => void save().finally(() => process.exit(0)));
  }
  return client;
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
