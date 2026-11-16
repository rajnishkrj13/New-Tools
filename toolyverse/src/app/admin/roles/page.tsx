import { count, eq } from 'drizzle-orm';
import { AREAS, AREA_INFO, ROLE_LABEL, ROLES } from '@/lib/auth/roles';
import { requireArea } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { saveAdminPermissions } from '../actions';

const yes = <span className="font-semibold text-ok">Yes</span>;
const no = <span className="text-ink-3">No</span>;

/** Super admins decide here what admins may do; the table shows every role side by side. */
export default async function AdminRoles() {
  const { perms } = await requireArea('roles');
  const d = await db();
  const counts = Object.fromEntries(
    await Promise.all(ROLES.map(async (r) => [r, (await d.select({ n: count() }).from(schema.users).where(eq(schema.users.role, r)))[0].n] as const)),
  );

  const rows: [string, React.ReactNode, React.ReactNode, React.ReactNode, React.ReactNode][] = [
    ['Use public tools', yes, yes, yes, yes],
    ['Use members-only tools, higher file limits, saved items', no, yes, yes, yes],
    ...AREAS.map((a) => [`Admin: ${AREA_INFO[a].label}`, no, no, perms[a] ? yes : no, yes] as [string, React.ReactNode, React.ReactNode, React.ReactNode, React.ReactNode]),
    ['Suspend admins and super admins', no, no, no, yes],
    ['Change roles, set admin permissions', no, no, no, yes],
  ];

  return (
    <div>
      <h1 className="display text-[2.4rem]">Roles &amp; permissions</h1>
      <p className="mt-2 max-w-[70ch] text-ink-2">
        Only super admins see this page. Change a person’s role under Users. Here you decide which parts of the admin panel admins may use.
      </p>

      <div className="mt-6 overflow-x-auto border-t border-ink">
        <table className="w-full min-w-[640px] border-collapse text-[0.93rem]">
          <thead>
            <tr className="border-b border-ink text-left">
              <th className="label py-2 pr-3 font-normal">Can</th>
              <th className="label pr-3 font-normal">Public visitor</th>
              {['user', 'admin', 'superadmin'].map((r) => (
                <th key={r} className="label pr-3 font-normal">
                  {ROLE_LABEL[r as keyof typeof ROLE_LABEL]} ({counts[r] ?? 0})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, ...cells]) => (
              <tr key={label} className="border-b border-rule">
                <td className="py-2 pr-3">{label}</td>
                {cells.map((c, i) => (
                  <td key={i} className="pr-3">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={saveAdminPermissions} className="mt-8 max-w-xl border border-ink bg-card p-5">
        <h2 className="display text-[1.35rem]">What admins may do</h2>
        <div className="mt-3 space-y-3">
          {AREAS.map((a) => (
            <label key={a} className="flex items-start gap-2.5">
              <input type="checkbox" name={a} defaultChecked={perms[a]} className="mt-1" />
              <span>
                <span className="font-medium">{AREA_INFO[a].label}</span>
                <span className="block text-[0.85rem] text-ink-3">{AREA_INFO[a].hint}</span>
              </span>
            </label>
          ))}
        </div>
        <button className="btn mt-4" type="submit">
          Save permissions
        </button>
      </form>
    </div>
  );
}
