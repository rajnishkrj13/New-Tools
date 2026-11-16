import { desc, ilike, or } from 'drizzle-orm';
import { getViewer } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { setUserDisabled, setUserRole } from '../actions';

export default async function AdminUsers({ searchParams }: PageProps<'/admin/users'>) {
  const { q } = await searchParams;
  const query = typeof q === 'string' ? q.trim() : '';
  const me = await getViewer();
  const d = await db();
  const base = d
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, disabled: schema.users.disabled, createdAt: schema.users.createdAt, lastLoginAt: schema.users.lastLoginAt })
    .from(schema.users);
  const users = await (query ? base.where(or(ilike(schema.users.email, `%${query}%`), ilike(schema.users.name, `%${query}%`))) : base).orderBy(desc(schema.users.createdAt)).limit(200);
  const date = (d: Date | null) => (d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  return (
    <div>
      <h1 className="display text-[2.4rem]">Users</h1>
      <form className="mt-4 flex max-w-md gap-2">
        <input name="q" defaultValue={query} placeholder="Search name or email" className="field" />
        <button className="btn" type="submit">
          Search
        </button>
      </form>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[0.93rem]">
          <thead>
            <tr className="border-b border-ink text-left">
              {['Name', 'Email', 'Role', 'Joined', 'Last login', ''].map((h) => (
                <th key={h} className="label py-2 pr-3 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-b border-rule ${u.disabled ? 'text-ink-3' : ''}`}>
                <td className="py-2.5 pr-3 font-medium">
                  {u.name}
                  {u.disabled && <span className="label ml-2 !text-bad">suspended</span>}
                </td>
                <td className="pr-3">{u.email}</td>
                <td className="pr-3">
                  <form action={setUserRole} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={u.id} />
                    <select name="role" defaultValue={u.role} className="field !min-h-8 !w-auto !py-0.5 text-sm">
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button className="btn btn-ghost !min-h-8 !px-2 text-xs" type="submit">
                      Set
                    </button>
                  </form>
                </td>
                <td className="pr-3 font-mono text-[0.85rem]">{date(u.createdAt)}</td>
                <td className="pr-3 font-mono text-[0.85rem]">{date(u.lastLoginAt)}</td>
                <td>
                  {u.id !== me?.id && (
                    <form action={setUserDisabled}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="disabled" value={String(!u.disabled)} />
                      <button className="btn btn-ghost !min-h-8 !px-2 text-xs" type="submit">
                        {u.disabled ? 'Restore' : 'Suspend'}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && <p className="mt-4 text-ink-3">No users found.</p>}
      </div>
    </div>
  );
}
