import Link from 'next/link';
import { logout } from '@/lib/auth/actions';
import type { Viewer } from '@/lib/auth/session';
import { isStaff } from '@/lib/auth/roles';
import { CATEGORIES, categoryPath } from '@/lib/tools/registry';
import { Logo } from './Logo';

export function SiteHeader({ viewer, announcement }: { viewer: Viewer; announcement?: string }) {
  return (
    <header className="border-b border-rule bg-paper">
      {announcement ? (
        <div className="bg-ink px-4 py-1.5 text-center text-[0.82rem] text-paper" role="note">
          {announcement}
        </div>
      ) : null}
      <div className="mx-auto flex max-w-[1180px] items-center gap-6 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="Toolyverse home" className="shrink-0">
          <Logo />
        </Link>
        <nav aria-label="Tool categories" className="hidden flex-1 items-center gap-1 md:flex">
          {CATEGORIES.map((c) => (
            <Link key={c.id} href={categoryPath(c)} className="rounded-xs px-3 py-1.5 text-[0.93rem] font-medium text-ink-2 hover:bg-paper-2 hover:text-ink">
              {c.name}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {viewer ? (
            <>
              {isStaff(viewer.role) && (
                <Link href="/admin" className="label rounded-xs border border-rule-2 px-2 py-1 !text-ink hover:border-ink">
                  Admin
                </Link>
              )}
              <Link href="/account" className="hidden text-[0.93rem] font-medium text-ink-2 hover:text-ink sm:inline">
                {viewer.name.split(' ')[0]}
              </Link>
              <form action={logout}>
                <button className="text-[0.93rem] text-ink-3 hover:text-ink" type="submit">
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="px-2 text-[0.93rem] font-medium text-ink-2 hover:text-ink">
                Log in
              </Link>
              <Link href="/signup" className="btn !min-h-9 !px-3.5 text-[0.9rem]">
                Sign up free
              </Link>
            </>
          )}
        </div>
      </div>
      <nav aria-label="Tool categories" className="flex gap-1 overflow-x-auto border-t border-rule px-3 py-1.5 md:hidden">
        {CATEGORIES.map((c) => (
          <Link key={c.id} href={categoryPath(c)} className="shrink-0 rounded-xs px-2.5 py-1 text-sm font-medium text-ink-2 hover:bg-paper-2">
            {c.name}
          </Link>
        ))}
      </nav>
    </header>
  );
}
