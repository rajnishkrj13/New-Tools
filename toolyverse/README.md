# Toolyverse

Free online tools for PDFs, images, GST and everyday conversions. Every tool runs in the
visitor's browser: files are never uploaded. Built with Next.js 16, Postgres (Drizzle ORM) and
the PDF editor from `../pdf-editor`.

## What is in it

- **24 tools in four drawers**: PDF (editor, merge, split, compress, rotate, JPG to PDF, PDF to
  JPG, protect), Image (compress to a target KB, resize in px/cm/%, crop, convert), GST
  (calculator with CGST/SGST/IGST, GSTIN checker with check digit, tax invoice maker, GSTR-1 to
  Excel, GSTR-3B to Excel, GSTR-1 vs GSTR-3B reconciliation, GSTR-2B merger) and Converters
  (units incl. gaj/bigha, number to words in lakh/crore, age, case, word counter).
- **GST return tools** come from the GST Toolkit (`GST_Toolkit_V1.html`). Its engine is kept
  verbatim in `src/lib/gst/core.ts` (reads portal GSTR-1/3B PDFs and cross-checks each return)
  and `src/lib/gst/gstr2b.ts` (GSTR-2B merger). Excel files are written with ExcelJS
  (`src/lib/gst/excel.ts`), and GSTR-2B files are read with SheetJS 0.20.3 from the SheetJS CDN
  (the npm `xlsx` 0.18 release has known security issues). Returns read in one GST tool can be
  reused in the others during the visit; members' GSTR-2B state names are kept on their account.
- **Roles** (`src/lib/auth/roles.ts`): public visitors (no account), members (bigger file
  limits, members-only tools, saved items on their account), **admins** (only the admin areas the
  super admin allows: tools, users, site settings) and **super admins** (everything, plus
  Admin → Roles & permissions, changing anyone's role and suspending admins). The first account
  on a fresh install becomes super admin, and the site always keeps one active super admin.
  Every admin page and action checks the role on the server.
- **Admin panel** (`/admin`): per tool switch it on or off, make it members-only, set file limits
  for visitors and members, and switch individual features (for the PDF editor: edit text, sign,
  forms, OCR, redaction, protection, combine/split, export, print). Users (roles, suspend) and
  site settings (sign-ups open, announcement bar). Changes apply immediately.
- **SEO**: short URLs (`/merge-pdf`, `/gst-tools`), unique titles and descriptions, canonical
  links, Open Graph and Twitter cards with a generated image per tool, JSON-LD (WebApplication,
  BreadcrumbList, FAQPage, ItemList), XML sitemap and robots.txt that drop switched-off tools,
  server-rendered tool pages with how-to steps and FAQs, internal links from every page.

## SEO

- The PDF editor page (`/pdf-editor`) carries the long-form content; one landing page per search
  intent opens the same editor on the right tool: `/sign-pdf`, `/fill-pdf-form`,
  `/add-text-to-pdf`, `/edit-scanned-pdf`, `/redact-pdf`, `/watermark-pdf`, `/add-image-to-pdf`,
  and `/hindi-pdf-editor` in Hindi (linked to the English page with hreflang). Their content is in
  `src/lib/tools/editor-pages.ts`; sections, FAQs and keywords for every tool are in
  `src/lib/tools/registry.ts`. Change `CONTENT_UPDATED` (or a page's `updated`) when you revise text.
- After launch: set `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION`, verify the domain in
  Google Search Console and Bing Webmaster Tools, submit `/sitemap.xml`, and set
  `NEXT_PUBLIC_SITE_SAME_AS` to the brand's social profiles.

## Run it locally

```bash
npm install
```

```bash
npm run build:editor
```

```bash
npm run dev
```

Open http://localhost:3000. **The first account that signs up becomes the super admin**, so
sign up yourself before you share the address. If the local PGlite database is ever left
unreadable (the dev server was killed mid-write), stop the server, delete or rename
`.data/pglite` and start again. Without `DATABASE_URL` the site uses PGlite
(real Postgres running inside Node) with its data in `.data/pglite`.

## Deploy to your server

1. Create a Postgres database and user.
2. Set `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL` and optionally `NEXT_PUBLIC_CONTACT_EMAIL` (see
   `.env.example`).
3. Build and start (Node 20.9 or newer):

```bash
npm ci && npm --prefix ../pdf-editor ci && npm run build:editor && npm run build
```

```bash
npm start
```

Tables are created on first start (migrations in `./drizzle` run automatically). Put the app
behind HTTPS (for example nginx or Caddy); the sign-in cookie is marked secure in production.
After the first deploy, sign up to become the admin, then submit `/sitemap.xml` in Google
Search Console.

## Develop

- `npm test` (calculation tests), `npm run typecheck`, `npm run lint`.
- Tool pages and SEO text live in `src/lib/tools/registry.ts`; each tool's code is
  `src/tools/<slug>.tsx`. Adding a tool: add an entry to the registry and a component to
  `src/tools/ToolHost.tsx`.
- Schema changes: edit `src/lib/db/schema.ts`, then `npm run db:generate`.
- `src/lib/pdf/PdfTools.ts` is a copy of `pdf-editor/src/engines/PdfTools.ts`; keep them in step.

## Notes

- Tools run in the browser, so "members only" controls who is offered the tool; it is not a
  security boundary for code that is already public.
- Several server processes each keep the admin's tool settings in memory for up to 30 seconds.
- Password reset by email and Google sign-in are not built yet (they need an email service and
  OAuth credentials).
