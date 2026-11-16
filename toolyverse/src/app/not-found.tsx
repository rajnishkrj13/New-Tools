import Link from 'next/link';
import { CATEGORIES, categoryPath } from '@/lib/tools/registry';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[760px] px-4 pt-20 text-center">
      <p className="label">Error 404</p>
      <h1 className="display mt-3 text-[3rem]">That drawer is empty</h1>
      <p className="mt-3 text-ink-2">The page you wanted is not here. It may have moved, or the tool may be switched off for now.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn">
          All tools
        </Link>
        {CATEGORIES.map((c) => (
          <Link key={c.id} href={categoryPath(c)} className="btn btn-ghost">
            {c.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
