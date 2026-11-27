import { describe, expect, it } from 'vitest';
import { CATEGORIES, TOOLS, toolBySlug } from '../src/lib/tools/registry';
import { LANDING_PAGES } from '../src/lib/tools/landing-pages';
import { QR_PAGES } from '../src/lib/tools/qr-pages';
import { TALLY_PAGES } from '../src/lib/tools/tally-pages';
import { isQrType } from '../src/lib/qr/payload';
import { config as proxyConfig } from '../src/proxy';

/** Every page search engines see is described well, and every link in the help text works. */

const pages = new Set(['/', '/about', '/privacy', '/terms', '/contact', '/signup', '/login', ...CATEGORIES.map((c) => `/${c.slug}`), ...TOOLS.map((t) => `/${t.slug}`)]);
const linksIn = (text: string) => [...text.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
const textOf = (o: { intro?: string; faqs?: { a: string }[]; sections?: { body?: string[]; list?: string[] }[] }) =>
  [o.intro ?? '', ...(o.faqs ?? []).map((f) => f.a), ...(o.sections ?? []).flatMap((s) => [...(s.body ?? []), ...(s.list ?? [])])].join('\n');

describe('search results', () => {
  it('keeps titles and descriptions short enough not to be cut off', () => {
    const long = TOOLS.flatMap((t) => [...(t.title.length > 60 ? [`${t.slug} title ${t.title.length}`] : []), ...(t.description.length > 160 ? [`${t.slug} description ${t.description.length}`] : [])]);
    expect(long).toEqual([]);
  });

  it('marks every Hindi page as Hindi for the whole document', () => {
    const hindi = TOOLS.filter((t) => t.lang === 'hi').map((t) => `/${t.slug}`).sort();
    expect([...proxyConfig.matcher].sort()).toEqual(hindi);
  });
});

describe('tool and landing page catalogue', () => {
  it('gives every page its own address, number, title and description', () => {
    const unique = (v: unknown[]) => expect(new Set(v).size).toBe(v.length);
    unique(TOOLS.map((t) => t.slug));
    unique(TOOLS.map((t) => t.no));
    unique(TOOLS.map((t) => t.title));
    unique(TOOLS.map((t) => t.description));
    unique(TOOLS.map((t) => t.h1));
    for (const c of CATEGORIES) expect(toolBySlug.has(c.slug)).toBe(false);
  });

  it('keeps titles and descriptions to what search results show', () => {
    for (const t of [...TOOLS, ...CATEGORIES]) {
      expect(t.title.length, t.title).toBeLessThanOrEqual(62);
      expect(t.description.length, t.description).toBeGreaterThanOrEqual(90);
      expect(t.description.length, t.description).toBeLessThanOrEqual(165);
    }
  });

  it('links only to pages that exist', () => {
    for (const t of TOOLS) {
      for (const r of t.related) expect(toolBySlug.has(r), `${t.slug} → related ${r}`).toBe(true);
      for (const href of linksIn(textOf(t))) expect(pages.has(href), `${t.slug} → ${href}`).toBe(true);
      expect(t.keywords.length, t.slug).toBeGreaterThan(0);
    }
    for (const c of CATEGORIES) for (const href of linksIn(textOf(c))) expect(pages.has(href), `${c.slug} → ${href}`).toBe(true);
  });

  it('opens a real tool on every landing page, set up with values that tool understands', () => {
    const known: Record<string, (p: Record<string, string>) => boolean> = {
      'compress-image': (p) => Number(p.kb) > 0,
      'convert-image': (p) => ['jpg', 'png', 'webp'].includes(p.to),
      'pdf-to-jpg': (p) => ['jpg', 'png'].includes(p.format),
      'crop-image': (p) => p.ratio === 'passport',
      'image-to-text': (p) => ['eng', 'hin', 'eng+hin'].includes(p.lang),
      'excel-to-tally-xml-converter': (p) => p.source === 'xml',
      'tally-xml-import': (p) => p.accept === 'excel',
      'qr-code-generator': (p) => (p.type === undefined || isQrType(p.type)) && (p.logo === undefined || ['on', 'off'].includes(p.logo)) && (p.mode === undefined || p.mode === 'bulk'),
    };
    for (const t of [...LANDING_PAGES, ...QR_PAGES, ...TALLY_PAGES]) {
      expect(toolBySlug.has(t.opens!), `${t.slug} opens ${t.opens}`).toBe(true);
      expect(toolBySlug.get(t.opens!)!.opens, `${t.slug} must open a tool, not another landing page`).toBeUndefined();
      if (t.preset) expect(known[t.opens!]?.(t.preset), `${t.slug} preset ${JSON.stringify(t.preset)}`).toBe(true);
      // A landing page has to say more than the tool page it opens.
      expect(t.sections?.length, t.slug).toBeGreaterThanOrEqual(2);
      expect(t.faqs.length, t.slug).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives each compress-to-a-size page the size in its address, title and preset', () => {
    for (const t of LANDING_PAGES.filter((p) => p.opens === 'compress-image')) {
      const kb = t.preset!.kb;
      expect(t.slug).toBe(`compress-image-to-${kb}kb`);
      expect(t.title).toContain(`${kb} KB`);
      expect(t.h1).toContain(`${kb} KB`);
    }
  });
});
