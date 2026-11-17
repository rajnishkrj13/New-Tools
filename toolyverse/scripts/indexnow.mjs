// Tells search engines that use IndexNow (Bing, Yandex, Seznam, Naver and others) which pages
// are new or changed, so they are crawled within minutes instead of days. Google does not use
// IndexNow: submit the sitemap in Google Search Console for it.
//
//   node scripts/indexnow.mjs <site-url> <state-file>
//
// Reads the live sitemap and sends only the pages whose <lastmod> changed since the last run
// (remembered in the state file), as IndexNow asks. The key is the public file
// public/<key>.txt, which proves the site sends the notice. Safe to run after every deploy.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [site = process.env.NEXT_PUBLIC_SITE_URL, stateFile = '.indexnow-sent.json'] = process.argv.slice(2);
if (!site || /localhost|127\.0\.0\.1/.test(site)) {
  console.log('indexnow: no public site address, nothing sent');
  process.exit(0);
}
const base = site.replace(/\/$/, '');
const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const keyFile = readdirSync(pub).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) {
  console.log('indexnow: no key file in public/, nothing sent');
  process.exit(0);
}
const key = keyFile.slice(0, -4);

const xml = await (await fetch(`${base}/sitemap.xml`)).text();
const entries = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => ({ url: m[1], lastmod: m[2] ?? '' }));
const sent = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
const changed = entries.filter((e) => sent[e.url] !== e.lastmod);
if (!changed.length) {
  console.log(`indexnow: ${entries.length} pages in the sitemap, none changed since the last notice`);
  process.exit(0);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(base).host, key, keyLocation: `${base}/${keyFile}`, urlList: changed.map((e) => e.url) }),
});
// 200 = received, 202 = received and the key is still being checked.
if (res.status === 200 || res.status === 202) {
  for (const e of changed) sent[e.url] = e.lastmod;
  writeFileSync(stateFile, JSON.stringify(sent, null, 1));
  console.log(`indexnow: told search engines about ${changed.length} new or changed pages (HTTP ${res.status})`);
} else {
  console.log(`indexnow: not accepted (HTTP ${res.status}) ${(await res.text()).slice(0, 200)}`);
}
