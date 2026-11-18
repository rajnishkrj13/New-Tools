import Link from 'next/link';
import { CategoryGlyph } from '@/components/CategoryGlyph';
import { JsonLd } from '@/components/JsonLd';
import { ToolList } from '@/components/ToolList';
import { ToolSearch } from '@/components/ToolSearch';
import { SITE } from '@/lib/config';
import { pageMeta } from '@/lib/seo';
import { CATEGORIES, TOOLS, categoryPath, toolPath, toolsIn } from '@/lib/tools/registry';
import { allToolStates } from '@/lib/tools/settings';

export const metadata = pageMeta({
  title: 'Free PDF Editor & Online Tools, No Upload | Toolyverse',
  absoluteTitle: true,
  description:
    'Free PDF editor that changes the text itself, plus tools to sign, merge and compress PDFs, shrink images, calculate GST and convert units. No upload.',
  path: '/',
});

export default async function Home() {
  const states = await allToolStates();
  const visible = TOOLS.filter((t) => states.get(t.slug)?.enabled).sort((a, b) => a.no - b.no);
  const members = new Set(visible.filter((t) => states.get(t.slug)?.access === 'members').map((t) => t.slug));

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'WebSite', '@id': `${SITE.url}/#website`, url: SITE.url, name: SITE.name, inLanguage: 'en-IN', description: SITE.tagline },
            {
              '@type': 'Organization',
              '@id': `${SITE.url}/#org`,
              name: SITE.name,
              url: SITE.url,
              logo: `${SITE.url}/icon.svg`,
              ...(SITE.sameAs.length ? { sameAs: SITE.sameAs } : {}),
            },
            {
              '@type': 'ItemList',
              name: 'Toolyverse tools',
              itemListElement: visible.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE.url}${toolPath(t)}`, name: t.name })),
            },
          ],
        }}
      />

      <section className="border-b border-rule">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-4 pb-14 pt-12 sm:px-6 md:grid-cols-[1fr_300px] md:pt-16">
          <div>
            <h1 className="label">Free PDF editor and online tools · {visible.length} tools, no upload</h1>
            <p className="display mt-4 max-w-[14ch] text-[3.1rem] sm:text-[4.4rem]">
              Small jobs, <span className="italic text-signal">done properly.</span>
            </p>
            <p className="mt-5 max-w-[56ch] text-[1.08rem] text-ink-2">
              Edit the text of a PDF and sign it, shrink a photo for an exam form, work out GST on a quote, write an amount in words for a cheque. Every tool here runs in your browser, so your
              files stay on your device.
            </p>
            <div className="mt-8 max-w-[560px]">
              <ToolSearch items={visible.map(({ slug, name, short, category, keywords }) => ({ slug, name, short, category, keywords }))} />
            </div>
          </div>

          <aside aria-label="At a glance" className="self-end border border-ink bg-card">
            <div className="border-b border-ink bg-ink px-4 py-2">
              <span className="label !text-paper">Receipt</span>
            </div>
            <dl className="divide-y divide-dashed divide-rule-2 px-4 font-mono text-[0.9rem]">
              {[
                ['Files uploaded', '0'],
                ['Watermarks added', 'none'],
                ['Account needed', 'no'],
                ['Price', '₹0'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2.5">
                  <dt className="text-ink-2">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-ink px-4 py-2.5 text-[0.8rem] text-ink-3">
              A free account adds bigger files and saved signatures. <Link href="/signup" className="text-ink underline underline-offset-2">Sign up</Link>
            </p>
          </aside>
        </div>
      </section>

      <section aria-labelledby="drawers" className="mx-auto max-w-[1180px] px-4 pt-14 sm:px-6">
        <h2 id="drawers" className="label">The drawers</h2>
        <div className="mt-4 grid border-l border-t border-ink sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {CATEGORIES.map((c) => {
            const tools = toolsIn(c.id).filter((t) => states.get(t.slug)?.enabled);
            return (
              <div key={c.id} className="relative border-b border-r border-ink bg-card p-5">
                <span className="absolute right-0 top-0 h-1.5 w-16" style={{ background: `var(--${c.id})` }} aria-hidden="true" />
                <CategoryGlyph id={c.id} />
                <h3 className="display mt-4 text-[1.6rem]">
                  <Link href={categoryPath(c)} className="hover:text-signal">
                    {c.name}
                  </Link>
                </h3>
                <p className="mt-1.5 text-[0.92rem] text-ink-2">{c.blurb}</p>
                <ul className="mt-4 space-y-1 text-[0.92rem]">
                  {tools.slice(0, 4).map((t) => (
                    <li key={t.slug}>
                      <Link href={toolPath(t)} className="underline decoration-rule-2 underline-offset-[3px] hover:decoration-ink">
                        {t.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href={categoryPath(c)} className="label mt-4 inline-block !text-ink hover:underline">
                  All {tools.length} →
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="all-tools" className="mx-auto max-w-[1180px] px-4 pt-16 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <h2 id="all-tools" className="display text-[2rem]">
            Every tool, in order
          </h2>
          <p className="label hidden sm:block">Numbered as they were added</p>
        </div>
        <div className="mt-5">
          <ToolList tools={visible} members={members} />
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto max-w-[1180px] px-4 pt-16 sm:px-6">
        <h2 id="how" className="display text-[2rem]">
          Why it works this way
        </h2>
        <div className="mt-6 grid gap-8 md:grid-cols-3">
          {[
            ['Your files stay with you', 'PDFs and photos are opened by your own browser. Nothing is sent to a server, so there is nothing for us to store, leak or delete.'],
            ['No watermark, no trial', 'Results are clean files you can send anywhere. The tools are free; an account only adds larger file limits and things saved across devices.'],
            ['Made for Indian paperwork', 'GST in CGST/SGST or IGST, amounts in lakh and crore, photos sized for exam and job forms, Hindi text in PDFs.'],
          ].map(([h, p], i) => (
            <div key={h} className="border-t-2 border-ink pt-4">
              <p className="label">0{i + 1}</p>
              <h3 className="display mt-2 text-[1.3rem]">{h}</h3>
              <p className="mt-2 text-[0.95rem] text-ink-2">{p}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
