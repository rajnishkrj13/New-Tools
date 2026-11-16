import Link from 'next/link';
import { CATEGORIES, categoryPath, toolPath, toolsIn } from '@/lib/tools/registry';
import { LogoMark } from './Logo';

/** Every tool is linked from every page: good for visitors browsing and for search engines. */
export function SiteFooter({ hidden }: { hidden: Set<string> }) {
  return (
    <footer className="mt-24 border-t border-ink bg-paper-2">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_repeat(4,1fr)]">
        <div>
          <div className="flex items-center gap-2">
            <LogoMark size={24} />
            <span className="display text-xl font-bold">Toolyverse</span>
          </div>
          <p className="mt-3 max-w-[30ch] text-sm text-ink-2">Everyday tools that run in your browser. Your files are not uploaded to us.</p>
          <ul className="mt-5 space-y-1.5 text-sm">
            <li><Link className="text-ink-2 hover:text-ink" href="/about">About</Link></li>
            <li><Link className="text-ink-2 hover:text-ink" href="/privacy">Privacy</Link></li>
            <li><Link className="text-ink-2 hover:text-ink" href="/terms">Terms</Link></li>
            <li><Link className="text-ink-2 hover:text-ink" href="/contact">Contact</Link></li>
          </ul>
        </div>
        {CATEGORIES.map((c) => (
          <div key={c.id}>
            <Link href={categoryPath(c)} className="label !text-ink hover:underline">
              {c.name}
            </Link>
            <ul className="mt-3 space-y-1.5 text-sm">
              {toolsIn(c.id)
                .filter((t) => !hidden.has(t.slug))
                .map((t) => (
                  <li key={t.slug}>
                    <Link className="text-ink-2 hover:text-ink" href={toolPath(t)}>
                      {t.name}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-rule">
        <p className="mx-auto max-w-[1180px] px-4 py-4 text-xs text-ink-3 sm:px-6">© {new Date().getFullYear()} Toolyverse. Made in India.</p>
      </div>
    </footer>
  );
}
