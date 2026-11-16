import Link from 'next/link';
import { categoryById, toolNo, toolPath, type Tool } from '@/lib/tools/registry';

/** A catalogue page: numbered entries in a ruled ledger, not a grid of cards. */
export function ToolList({ tools, members }: { tools: Tool[]; members?: Set<string> }) {
  return (
    <ol className="border-t border-ink">
      {tools.map((t) => {
        const cat = categoryById.get(t.category)!;
        return (
          <li key={t.slug} className="border-b border-rule">
            <Link href={toolPath(t)} className="group grid grid-cols-[3.2rem_1fr_auto] items-baseline gap-x-3 py-3.5 sm:grid-cols-[4rem_15rem_1fr_auto]">
              <span className="label tabular-nums" style={{ color: `var(--${t.category})` }}>
                №{toolNo(t)}
              </span>
              <span className="display text-[1.25rem] group-hover:text-signal">{t.name}</span>
              <span className="col-start-2 text-[0.93rem] text-ink-2 sm:col-start-auto">{t.short}</span>
              <span className="label row-start-1 hidden whitespace-nowrap sm:col-start-4 sm:block">
                {members?.has(t.slug) ? 'Members · ' : ''}
                {cat.name.replace(' tools', '')}
                <span aria-hidden="true" className="ml-2 inline-block transition-transform group-hover:translate-x-1">→</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
