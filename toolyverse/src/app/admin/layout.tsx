import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };

const NAV = [
  ['/admin', 'Overview'],
  ['/admin/tools', 'Tools & features'],
  ['/admin/users', 'Users'],
  ['/admin/site', 'Site settings'],
];

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  // Non-admins get a plain 404: the admin area does not reveal that it exists.
  await requireAdmin();
  return (
    <div className="mx-auto grid max-w-[1180px] gap-8 px-4 pt-10 sm:px-6 md:grid-cols-[200px_1fr]">
      <nav aria-label="Admin" className="md:sticky md:top-6 md:self-start">
        <p className="label">Admin</p>
        <ul className="mt-3 border-t border-ink">
          {NAV.map(([href, label]) => (
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
