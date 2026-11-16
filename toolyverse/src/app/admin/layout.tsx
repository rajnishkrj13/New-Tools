import type { Metadata } from 'next';
import Link from 'next/link';
import { canAccess, ROLE_LABEL, type Area } from '@/lib/auth/roles';
import { requireArea } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };

const NAV: [string, string, Area][] = [
  ['/admin', 'Overview', 'overview'],
  ['/admin/tools', 'Tools & features', 'tools'],
  ['/admin/users', 'Users', 'users'],
  ['/admin/site', 'Site settings', 'site'],
  ['/admin/roles', 'Roles & permissions', 'roles'],
];

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  // Anyone who is not an admin or super admin gets a plain 404: the admin area does not reveal that it exists.
  const { viewer, perms } = await requireArea('overview');
  return (
    <div className="mx-auto grid max-w-[1180px] gap-8 px-4 pt-10 sm:px-6 md:grid-cols-[200px_1fr]">
      <nav aria-label="Admin" className="md:sticky md:top-6 md:self-start">
        <p className="label">{ROLE_LABEL[viewer.role]}</p>
        <ul className="mt-3 border-t border-ink">
          {NAV.filter(([, , area]) => canAccess(viewer.role, area, perms)).map(([href, label]) => (
            <li key={href} className="border-b border-rule">
              <Link href={href} className="block py-2.5 text-[0.95rem] hover:text-signal">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
