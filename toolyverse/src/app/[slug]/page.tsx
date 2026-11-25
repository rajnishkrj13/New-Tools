import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CategoryGlyph } from '@/components/CategoryGlyph';
import { JsonLd } from '@/components/JsonLd';
import { Rich, Sections } from '@/components/Sections';
import { ToolList } from '@/components/ToolList';
import { getViewer } from '@/lib/auth/session';
import { SITE } from '@/lib/config';
import { CONTENT_UPDATED, categoryById, categoryBySlug, categoryPath, toolBySlug, toolNo, toolPath, toolsIn, type Category, type Tool } from '@/lib/tools/registry';
import { accessFor, allToolStates } from '@/lib/tools/settings';
import { ToolHost } from '@/tools/ToolHost';

/** One address space for drawers (/pdf-tools) and tools (/merge-pdf): short URLs rank and read better. */

export async function generateMetadata({ params }: PageProps<'/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const cat = categoryBySlug.get(slug);
  if (cat) return meta(cat.title, cat.description, categoryPath(cat));
  const tool = toolBySlug.get(slug);
  if (!tool) return {};
  const state = (await allToolStates()).get(slug);
  const m = meta(tool.title, tool.description, toolPath(tool), tool);
  // A switched-off tool is gone from the site; tell search engines not to keep it.
  if (!state?.enabled) m.robots = { index: false, follow: true };
  return m;
}

function meta(title: string, description: string, path: string, tool?: Tool): Metadata {
  // A page in two languages points at both versions (hreflang), each naming itself too.
  const languages = tool?.alternates ? { [tool.lang === 'hi' ? 'hi-IN' : 'en-IN']: path, ...tool.alternates } : undefined;
  return {
    // Google shows about 60 characters: the brand is added only when it still fits.
    title: { absolute: title.length + SITE.name.length + 3 <= 62 ? `${title} | ${SITE.name}` : title },
    description,
    keywords: tool?.keywords,
    alternates: { canonical: path, languages },
    openGraph: { title, description, url: path, type: 'website', siteName: SITE.name, locale: tool?.lang === 'hi' ? 'hi_IN' : SITE.locale },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function Page({ params }: PageProps<'/[slug]'>) {
  const { slug } = await params;
  const cat = categoryBySlug.get(slug);
  if (cat) return <CategoryPage cat={cat} />;
  const tool = toolBySlug.get(slug);
  if (!tool) notFound();
  return <ToolPage tool={tool} />;
}

function Crumbs({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="label">
      <ol className="flex flex-wrap gap-x-2">
        {items.map((c, i) => (
          <li key={c.name} className="flex gap-2">
            {i > 0 && <span aria-hidden="true">/</span>}
            {c.href ? (
              <Link href={c.href} className="hover:text-ink">
                {c.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink-2">
                {c.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

const crumbLd = (items: { name: string; href: string }[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${SITE.url}${c.href}` })),
});

async function CategoryPage({ cat }: { cat: Category }) {
  const states = await allToolStates();
  const tools = toolsIn(cat.id).filter((t) => states.get(t.slug)?.enabled);
  const members = new Set(tools.filter((t) => states.get(t.slug)?.access === 'members').map((t) => t.slug));
  return (
    <div className="mx-auto max-w-[1180px] px-4 pt-8 sm:px-6">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'CollectionPage', name: cat.h1 ?? cat.name, description: cat.description, url: `${SITE.url}${categoryPath(cat)}` },
            crumbLd([
              { name: 'Home', href: '/' },
              { name: cat.name, href: categoryPath(cat) },
            ]),
            ...(cat.faqs ? [{ '@type': 'FAQPage', mainEntity: cat.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') } })) }] : []),
          ],
        }}
      />
      <Crumbs items={[{ name: 'Home', href: '/' }, { name: cat.name }]} />
      <header className="mt-6 grid items-end gap-6 border-b border-rule pb-8 md:grid-cols-[1fr_auto]">
        <div>
          <p className="label">
            Drawer {cat.mark} · {tools.length} tools
          </p>
          <h1 className="display mt-3 text-[2.8rem] sm:text-[3.6rem]">{cat.h1 ?? cat.name}</h1>
          <p className="mt-4 max-w-[62ch] text-[1.05rem] text-ink-2">{cat.intro}</p>
        </div>
        <CategoryGlyph id={cat.id} size={96} />
      </header>
      <div className="mt-8">
        <ToolList tools={tools} members={members} />
      </div>
      {cat.sections && (
        <div className="prose-tv mt-12 max-w-[760px]">
          <Sections sections={cat.sections} />
        </div>
      )}
      {cat.faqs && (
        <div className="prose-tv mt-4 max-w-[760px]">
          <h2>Questions people ask</h2>
          <div className="border-t border-rule">
            {cat.faqs.map((f) => (
              <details key={f.q} className="group border-b border-rule py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                  <h3 className="text-[1.02rem]">{f.q}</h3>
                  <span aria-hidden="true" className="font-mono text-ink-3 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="pb-3">
                  <Rich text={f.a} />
                </p>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

async function ToolPage({ tool }: { tool: Tool }) {
  const [states, viewer] = await Promise.all([allToolStates(), getViewer()]);
  const state = states.get(tool.slug)!;
  if (!state.enabled) notFound();
  const access = accessFor(state, viewer);
  const cat = categoryById.get(tool.category)!;
  const related = tool.related.map((s) => toolBySlug.get(s)!).filter((t) => t && states.get(t.slug)?.enabled);
  const url = `${SITE.url}${toolPath(tool)}`;
  // Big working screens get the full width; the help text stays at reading width.
  const runs = tool.opens ?? tool.slug;
  const wide = ['pdf-editor', 'gstr1-to-excel', 'gstr3b-to-excel', 'gstr1-vs-gstr3b', 'gstr2b-merger', 'gstr2b-vs-purchase-register', 'tally-journal-entry-excel', 'excel-to-tally-xml-converter', 'tally-xml-import', 'tally-xml-export', 'tally-xml-converter', 'pdf-to-excel', 'pdf-to-word', 'word-to-excel'].includes(runs);

  return (
    <article lang={tool.lang}>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebApplication',
              name: tool.name,
              url,
              description: tool.description,
              applicationCategory: tool.category === 'gst' || tool.category === 'tally' ? 'FinanceApplication' : 'UtilitiesApplication',
              operatingSystem: 'Any (runs in the browser)',
              browserRequirements: 'Requires JavaScript',
              isAccessibleForFree: true,
              inLanguage: tool.lang === 'hi' ? 'hi-IN' : 'en-IN',
              screenshot: `${url}/opengraph-image`,
              ...(tool.featureList ? { featureList: tool.featureList } : {}),
              dateModified: tool.updated ?? CONTENT_UPDATED,
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
              publisher: { '@id': `${SITE.url}/#org` },
            },
            crumbLd([
              { name: 'Home', href: '/' },
              { name: cat.name, href: categoryPath(cat) },
              { name: tool.name, href: toolPath(tool) },
            ]),
            {
              '@type': 'FAQPage',
              mainEntity: tool.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') } })),
            },
          ],
        }}
      />
      <div className="mx-auto max-w-[1180px] px-4 pt-8 sm:px-6">
        <Crumbs items={[{ name: 'Home', href: '/' }, { name: cat.name, href: categoryPath(cat) }, { name: tool.name }]} />
        <header className="mt-5 max-w-[760px]">
          <p className="label" style={{ color: `var(--${tool.category})` }}>
            №{toolNo(tool)} · {cat.name}
            {state.access === 'members' ? ' · Members' : ''}
          </p>
          <h1 className="display mt-2 text-[2.5rem] sm:text-[3.2rem]">{tool.h1}</h1>
          <p className="mt-3 text-[1.05rem] text-ink-2">{tool.intro}</p>
        </header>
      </div>

      <section aria-label={tool.name} className={`mx-auto mt-8 px-4 sm:px-6 ${wide ? 'max-w-[1600px]' : 'max-w-[1180px]'}`}>
        {access.needsLogin ? (
          <div className="border border-ink bg-card p-8 text-center">
            <p className="label">Members only</p>
            <p className="display mt-2 text-[1.6rem]">Sign in to use {tool.name}</p>
            <p className="mx-auto mt-2 max-w-[48ch] text-ink-2">An account is free. It also gives you larger file limits and keeps your saved items across devices.</p>
            <div className="mt-5 flex justify-center gap-2">
              <Link className="btn" href={`/signup?next=${encodeURIComponent(toolPath(tool))}`}>
                Create a free account
              </Link>
              <Link className="btn btn-ghost" href={`/login?next=${encodeURIComponent(toolPath(tool))}`}>
                Log in
              </Link>
            </div>
          </div>
        ) : (
          <ToolHost slug={runs} focus={tool.focus} preset={tool.preset} features={state.features} maxMb={access.maxMb} memberMaxMb={access.memberMaxMb} signedIn={!!viewer} />
        )}
      </section>

      <div className="mx-auto grid max-w-[1180px] gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_300px]">
        <div className="prose-tv">
          <h2>{tool.lang === 'hi' ? 'कैसे इस्तेमाल करें' : `How to use ${tool.name}`}</h2>
          <ol className="mt-4 space-y-3">
            {tool.steps.map((s, i) => (
              <li key={s} className="grid grid-cols-[2.2rem_1fr] gap-2">
                <span className="display text-[1.4rem] leading-none text-signal">{i + 1}</span>
                <span className="text-ink-2">{s}</span>
              </li>
            ))}
          </ol>

          {tool.sections && <Sections sections={tool.sections} />}

          <h2>{tool.lang === 'hi' ? 'अक्सर पूछे जाने वाले सवाल' : 'Questions people ask'}</h2>
          <div className="border-t border-rule">
            {tool.faqs.map((f) => (
              <details key={f.q} className="group border-b border-rule py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                  <h3 className="text-[1.02rem]">{f.q}</h3>
                  <span aria-hidden="true" className="font-mono text-ink-3 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="pb-3">
                  <Rich text={f.a} />
                </p>
              </details>
            ))}
          </div>
        </div>

        {related.length > 0 && (
          <aside aria-labelledby="related" className="lg:pt-10">
            <h2 id="related" className="label">
              Often used next
            </h2>
            <ul className="mt-3 border-t border-ink">
              {related.map((t) => (
                <li key={t.slug} className="border-b border-rule">
                  <Link href={toolPath(t)} className="group block py-3">
                    <span className="display text-[1.1rem] group-hover:text-signal">{t.name}</span>
                    <span className="block text-sm text-ink-3">{t.short}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </article>
  );
}
