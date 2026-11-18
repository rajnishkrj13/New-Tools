import { EDITOR_PAGES } from './editor-pages';
import { LANDING_PAGES } from './landing-pages';

/**
 * Every tool on Toolyverse: its address, what search engines see, the help text on its page
 * and the features an administrator can switch off. The code that does the work lives in
 * src/tools/<slug>.tsx; this file is plain data so both server and browser can read it.
 */

export type CategoryId = 'pdf' | 'image' | 'gst' | 'convert';

export interface Category {
  id: CategoryId;
  slug: string;
  name: string;
  /** Shown on the home page and category page. */
  blurb: string;
  title: string;
  description: string;
  intro: string;
  /** Catalogue mark: two letters printed on the drawer label. */
  mark: string;
  /** Help below the list of tools: which tool for which job. */
  sections?: Section[];
}

export interface Feature {
  key: string;
  label: string;
  /** What switching it off removes, for the admin. */
  hint: string;
  default: boolean;
}

export interface Tool {
  slug: string;
  category: CategoryId;
  /** Catalogue number, printed next to the name. */
  no: number;
  name: string;
  /** One line under the name in lists. */
  short: string;
  /** <title>, under 60 characters. */
  title: string;
  /** Meta description, under 160 characters. */
  description: string;
  h1: string;
  intro: string;
  steps: string[];
  faqs: { q: string; a: string }[];
  features?: Feature[];
  /** File size limits in MB for visitors and for signed-in members; omitted for tools without files. */
  limits?: { publicMb: number; memberMb: number };
  related: string[];
  keywords: string[];
  /** Long-form help below the how-to: what search engines and careful readers both want. */
  sections?: Section[];
  /** Feature list for structured data (WebApplication.featureList). */
  featureList?: string[];
  /** This page runs another tool's code (landing pages that open the PDF editor). */
  opens?: string;
  /** For the PDF editor: which tool to open first once a file is loaded. */
  focus?: 'sign' | 'addtext' | 'edittext' | 'redact' | 'stamp' | 'ocr' | 'image' | 'forms';
  /**
   * Settings the opened tool starts with, for pages made for one search (for example
   * { kb: '20' } on "compress image to 20 KB"). Each tool reads the keys it knows.
   */
  preset?: Record<string, string>;
  /** Language of the page content when it is not English. */
  lang?: 'hi';
  /** The same page in other languages, for hreflang: { 'hi-IN': '/hindi-pdf-editor' }. */
  alternates?: Record<string, string>;
  /** When the page content last changed (YYYY-MM-DD), for the sitemap. */
  updated?: string;
}

/**
 * A block of long-form help. Paragraphs may contain [links](/path). List items written as
 * "Label: text" show the label in bold.
 */
export interface Section {
  h2: string;
  body?: string[];
  list?: string[];
  table?: { head: string[]; rows: string[][] };
}

/** Date the catalogue's text was last revised; pages without their own date use it. */
export const CONTENT_UPDATED = '2026-11-17';

export const CATEGORIES: Category[] = [
  {
    id: 'pdf',
    slug: 'pdf-tools',
    name: 'PDF tools',
    mark: 'Pd',
    blurb: 'Edit, merge, split, compress and sign PDFs without installing anything.',
    title: 'Free PDF Tools Online – Edit, Merge, Split, Compress',
    description: 'Edit text in a PDF, merge, split, compress, rotate and password-protect PDFs online. Free, no watermark, and your files never leave your browser.',
    intro:
      'Every PDF tool here works inside your browser. Your file is read on your own computer or phone and is never uploaded to us, which is why there is no upload wait and nothing to delete afterwards.',
    sections: [
      {
        h2: 'Which PDF tool do I need?',
        list: [
          'Change what the PDF says: the [PDF Editor](/pdf-editor) edits existing text, adds text and images, and fills forms.',
          'Sign it: [Sign PDF](/sign-pdf) places a drawn or uploaded signature, initials and the date.',
          'Too big to email or upload: [Compress PDF](/compress-pdf) shrinks the photos inside it.',
          'Several files into one: [Merge PDF](/merge-pdf); one file into several: [Split PDF](/split-pdf).',
          'Pages sideways: [Rotate PDF](/rotate-pdf).',
          'Photos or screenshots into a PDF: [JPG to PDF](/jpg-to-pdf) or [PNG to PDF](/png-to-pdf); the other way: [PDF to JPG](/pdf-to-jpg) or [PDF to PNG](/pdf-to-png).',
          'Keep it private: [Protect PDF](/protect-pdf) adds a password, [Redact PDF](/redact-pdf) removes text for good.',
          'A scan you cannot select text in: [Edit Scanned PDF](/edit-scanned-pdf) recognises the text first.',
        ],
      },
      {
        h2: 'Why nothing is uploaded',
        body: [
          'PDFs are often salary slips, bank statements, ID cards and contracts. Most online PDF sites copy them to their servers to work on them. Here the work happens in your browser, so the document never leaves your device and there is nothing to delete afterwards. The tools work the same on a phone, with no app to install and no watermark on the result.',
        ],
      },
    ],
  },
  {
    id: 'image',
    slug: 'image-tools',
    name: 'Image tools',
    mark: 'Im',
    blurb: 'Shrink, resize, crop and convert photos for forms, email and the web.',
    title: 'Free Image Tools Online – Compress, Resize, Crop, Convert',
    description: 'Compress JPG and PNG, resize to exact pixels or KB, crop and convert between JPG, PNG and WebP. Free and private: images stay on your device.',
    intro:
      'Government forms want a photo under 50 KB, email wants something smaller than 10 MB, websites want WebP. These tools do the job in the browser, with a preview before you download.',
    sections: [
      {
        h2: 'Which image tool do I need?',
        list: [
          'Too many KB for a form: [Compress Image](/compress-image), or start from the common limits: [20 KB](/compress-image-to-20kb), [50 KB](/compress-image-to-50kb), [100 KB](/compress-image-to-100kb), [200 KB](/compress-image-to-200kb).',
          'Exact pixels or centimetres: [Resize Image](/resize-image).',
          'Passport shape or a square profile picture: [Passport Size Photo](/passport-size-photo) or [Crop Image](/crop-image).',
          'Wrong file type: [PNG to JPG](/png-to-jpg), [JPG to PNG](/jpg-to-png), [WebP to JPG](/webp-to-jpg), or any of them in [Convert Image](/convert-image).',
          'Several photos into one document: [JPG to PDF](/jpg-to-pdf).',
        ],
      },
      {
        h2: 'Photos and signatures for online application forms',
        body: [
          'Recruitment, university and scholarship portals usually set three rules for the photo and the signature: the file type (almost always JPG), a size in KB, and sometimes the dimensions in pixels. A common pattern is a photo of 20 to 50 KB and a signature of 10 to 20 KB, but each notification sets its own numbers, so read it first.',
          'Work in this order for the sharpest result: crop to the face or signature, resize to the pixels asked for, then compress to the KB limit. Each step runs in your browser, so your photo and signature are never uploaded to Toolyverse.',
        ],
      },
    ],
  },
  {
    id: 'gst',
    slug: 'gst-tools',
    name: 'GST tools',
    mark: 'Gs',
    blurb: 'Calculate GST, make invoices, convert GSTR-1 and 3B to Excel and reconcile them.',
    title: 'GST Tools – Calculator, Invoice, GSTR-1/3B Excel, Reconcile',
    description: 'Free GST tools: calculator, GSTIN checker, invoice maker, GSTR-1 and GSTR-3B PDF to Excel, GSTR-1 vs 3B reconciliation and GSTR-2B merger. Files stay on your device.',
    intro:
      'Tools for the GST work that comes up every day and at year end: tax on a price, checking a GSTIN, a clean tax invoice, and turning a year of GSTR-1, GSTR-3B and GSTR-2B files into checked, reconciled Excel workbooks. Returns are read in your browser and never uploaded.',
    sections: [
      {
        h2: 'Which GST tool for which job',
        list: [
          'Tax on a price: [GST Calculator](/gst-calculator) adds or removes GST at 5, 12, 18 or 28% and splits it into CGST and SGST or IGST.',
          'Is this GSTIN real-looking: [GSTIN Checker](/gstin-validator) checks the format, state code, PAN and check digit, for many numbers at once.',
          'Bill a customer: [GST Invoice Maker](/gst-invoice-generator) builds a tax invoice with HSN/SAC, the right tax split and the amount in words.',
          'A year of returns into Excel: [GSTR-1 to Excel](/gstr1-to-excel) and [GSTR-3B to Excel](/gstr3b-to-excel) read the filed return PDFs from the portal.',
          'Do the returns agree: [GSTR-1 vs GSTR-3B](/gstr1-vs-gstr3b) compares them month by month and table by table.',
          'Input tax credit statements: [GSTR-2B Merger](/gstr2b-merger) joins the monthly GSTR-2B Excel files into one.',
        ],
      },
      {
        h2: 'Year-end checks before the annual return',
        body: [
          'Download the filed GSTR-1 and GSTR-3B PDFs for the financial year from the GST portal and drop them all into the converters at once: each return is read, checked against its own totals, and placed in its month. The GSTR-1 vs GSTR-3B report then shows where declared sales and tax paid differ, which is the first thing to settle before the annual return. Your clients’ returns are read in your browser and are never uploaded.',
        ],
      },
    ],
  },
  {
    id: 'convert',
    slug: 'converters',
    name: 'Converters',
    mark: 'Cv',
    blurb: 'Units, numbers in words, ages and text, converted instantly.',
    title: 'Free Online Converters – Units, Number to Words, Age, Text',
    description: 'Convert units, write numbers in words in Indian or international style, calculate exact age and change text case. Quick, free and ad-light.',
    intro: 'Quick answers to everyday conversion questions, with the working shown where it helps.',
    sections: [
      {
        h2: 'What each converter is for',
        list: [
          'Measurements: [Unit Converter](/unit-converter) covers length, weight, area, volume and temperature, including Indian land units such as gaj, bigha and guntha.',
          'Amounts for cheques and invoices: [Number to Words](/number-to-words) writes rupees and paise in lakh and crore, or in millions.',
          'Eligibility and dates: [Age Calculator](/age-calculator) gives the exact age on any date, such as an exam’s cut-off date.',
          'Text in the wrong case: [Case Converter](/case-converter) switches between UPPER, lower, Title and Sentence case.',
          'Word limits: [Word Counter](/word-counter) counts words, characters and reading time as you type, in English or Hindi.',
        ],
      },
      {
        h2: 'Answers you can check',
        body: [
          'Each converter shows how it got the answer where that matters: which bigha size is used, how calendar months are counted in an age, which small words stay lower-case in a title. Everything is worked out in your browser as you type, so results appear at once and nothing you enter is sent anywhere.',
        ],
      },
    ],
  },
];

export const TOOLS: Tool[] = [
  // ---- PDF ---------------------------------------------------------------------------------------
  {
    slug: 'pdf-editor',
    category: 'pdf',
    no: 1,
    name: 'PDF Editor',
    short: 'Change the text in a PDF, add images, sign and fill forms',
    title: 'PDF Editor: Edit PDF Text Online Free, No Upload',
    description: 'Free online PDF editor that changes the existing text. Add text, images and signatures, fill forms, OCR scans. Runs in your browser: no upload, no watermark.',
    h1: 'PDF Editor: edit PDF text online, free',
    intro:
      'Click any line of a PDF and type. The editor removes the old words and writes yours in the same font where the PDF allows, moving the rest of the paragraph along. Add text, images, signatures, highlights and form fields, fix scanned pages with OCR, then download a normal PDF. Everything happens in your browser: the file is never uploaded.',
    steps: [
      'Open your PDF with the button above or drop it on the editor. It is read on your device, not uploaded.',
      'Choose Edit Text and click the words you want to change, or pick another tool: Add Text, Sign, Highlight, Image, Whiteout, Draw, Shapes, Form or Stamp.',
      'Press Download PDF. Your changes are written into a normal PDF that opens anywhere, with no watermark.',
    ],
    sections: [
      {
        h2: 'What you can do with this PDF editor',
        list: [
          'Edit existing text: change words, numbers, dates and whole paragraphs; the text reflows and keeps its font, size and colour where the PDF includes them.',
          'Add text: type anywhere on the page in the font, size and colour you choose, including Hindi.',
          'Sign: draw or upload your signature once, save it, and drop it on any page with a click; add initials, today’s date, ticks and crosses. See [Sign PDF](/sign-pdf).',
          'Fill and create forms: type into a PDF’s own form fields, or add text fields and check boxes to a PDF that has none. See [Fill PDF form](/fill-pdf-form).',
          'Scanned PDFs: recognise the text of scans and photos (OCR, English and Hindi) so it can be searched, copied and edited. See [Edit scanned PDF](/edit-scanned-pdf).',
          'Images: add photos, logos and stamps; move, resize, replace or delete pictures that are already in the PDF. See [Add image to PDF](/add-image-to-pdf).',
          'Mark up: highlight, underline and strike out text, draw freehand, add shapes, arrows, links, tables and sticky-note comments.',
          'Redact and clean: black out text so it is removed from the file for good, find and redact phone numbers, emails and ID numbers, and strip hidden data. See [Redact PDF](/redact-pdf).',
          'Pages: rotate, reorder, delete, duplicate and insert pages, combine files, split one PDF into several, and add headers, footers, page numbers and watermarks. See [Watermark PDF](/watermark-pdf).',
          'Save and share: password-protect the result, make it smaller, print it, or export pages as JPG/PNG pictures or plain text.',
        ],
      },
      {
        h2: 'How editing the existing text works',
        body: [
          'Most online editors can only put a white box over old text and type on top, so the old words stay in the file and the new ones never quite match. This editor changes the text itself: it removes the original characters from the page content and writes the new ones in the same place.',
          'Where the PDF carries the font, the new text uses that exact font. When a letter is missing from the embedded font (PDFs often include only the characters they use), a close match is chosen and you can see and change it. Paragraphs reflow as you type, so lines stay in their column.',
          'Hindi and other Devanagari text is shaped properly, with joined letters and matras in the right place, both on screen and in the downloaded PDF.',
        ],
      },
      {
        h2: 'Your PDF never leaves your device',
        body: [
          'The editor is a program that runs in your browser tab. Your file is opened from your own disk and the finished PDF is saved back to it; nothing is sent to Toolyverse or anyone else. That is why it is fast even on large files, why it works for confidential documents such as contracts, salary slips, bank statements and ID proofs, and why there is nothing to delete afterwards.',
          'If you turn on auto-save, a copy of your work is kept in your browser’s own storage on this device, so you can close the tab and continue later. You can switch it off at any time.',
        ],
      },
      {
        h2: 'How it compares',
        table: {
          head: ['', 'Toolyverse PDF Editor', 'Typical upload-based online editors', 'Desktop PDF software'],
          rows: [
            ['Change the existing text', 'Yes, in the original font where available', 'Often only cover it and type on top', 'Yes'],
            ['Where your file goes', 'Stays on your device', 'Uploaded to their servers', 'Stays on your computer'],
            ['Price', 'Free; free account for bigger files', 'Free tier with daily limits, then subscription', 'Paid licence or subscription'],
            ['Watermark on the result', 'Never', 'Sometimes on free plans', 'No'],
            ['Install', 'Nothing; any modern browser', 'Nothing', 'Install and update the program'],
            ['Hindi text', 'Shaped correctly', 'Varies', 'Varies'],
          ],
        },
      },
      {
        h2: 'Works on Windows, Mac, Linux, Android and iPhone',
        body: [
          'Use it in Chrome, Edge, Firefox or Safari on any computer. It also works on phones and tablets; for detailed edits a larger screen is easier. There is no app to install and no account needed; a [free account](/signup) raises the file size limit and keeps your saved signatures on every device you log in on.',
        ],
      },
    ],
    faqs: [
      { q: 'Is this PDF editor really free?', a: 'Yes. Every editing feature is free, there is no trial and no watermark. A free account only raises the file size limit and saves your signatures and details across devices.' },
      { q: 'Can I really change the existing text, not just cover it?', a: 'Yes. The old words are removed from the page and the new ones are written in their place, in the same font when the PDF includes it. If the font is missing a letter, a close match is used.' },
      { q: 'Is my document uploaded anywhere?', a: 'No. The editor runs entirely in your browser. Closing the tab removes it unless you turned on auto-save, which keeps a copy only in your own browser.' },
      { q: 'Does it work with scanned PDFs?', a: 'Yes. Use "Recognise text (OCR)" from the File menu first; the scanned words, in English or Hindi, then become searchable and editable.' },
      { q: 'Is there a watermark on the result?', a: 'No. The downloaded PDF contains only your document and your changes.' },
      { q: 'Can I edit a password-protected PDF?', a: 'Yes, if you know the password: the editor asks for it when you open the file. You can keep the protection, change it or remove it when you download.' },
      { q: 'Can I edit Hindi text in a PDF?', a: 'Yes. Hindi text can be edited and added, and are shaped correctly in the downloaded file. There is also a [Hindi version of this page](/hindi-pdf-editor).' },
      { q: 'How big a PDF can I edit?', a: 'Up to 25 MB without an account and 100 MB with a free account. Long documents with hundreds of pages work; very large scans are slower on older phones.' },
      { q: 'Will the edited PDF open in Adobe Reader and on phones?', a: 'Yes. The result is a standard PDF that opens in Adobe Acrobat Reader, browsers, phones and every other PDF viewer.' },
      { q: 'Can I undo a change?', a: 'Yes. Every change can be undone and redone (Ctrl+Z and Ctrl+Y), and the original file on your disk is never changed.' },
    ],
    featureList: [
      'Edit existing PDF text in the original font',
      'Add text, images, shapes and links',
      'Sign PDF with saved signatures, initials and date',
      'Fill and create PDF form fields',
      'OCR for scanned PDFs in English and Hindi',
      'Secure redaction and hidden data removal',
      'Rotate, reorder, delete, combine and split pages',
      'Headers, footers, page numbers and watermarks',
      'Password protection and compression',
      'Works offline in the browser, no upload',
    ],
    alternates: { 'hi-IN': '/hindi-pdf-editor' },
    features: [
      { key: 'editText', label: 'Edit existing text', hint: 'Edit Text tool', default: true },
      { key: 'sign', label: 'Sign and saved signatures', hint: 'Sign menu: signatures, initials, date, ticks, saved details', default: true },
      { key: 'forms', label: 'Form fields', hint: 'Adding text fields and check boxes', default: true },
      { key: 'ocr', label: 'Text recognition (OCR)', hint: 'Recognise text on scanned pages', default: true },
      { key: 'redact', label: 'Redaction and privacy', hint: 'Secure redaction, find and redact, hidden data clean-up', default: true },
      { key: 'protect', label: 'Password protection', hint: 'Protect with a password', default: true },
      { key: 'combine', label: 'Combine and split', hint: 'Combine files, split into several files, add PDF', default: true },
      { key: 'export', label: 'Export as pictures or text', hint: 'Pages as PNG/JPG, text only, smaller file', default: true },
      { key: 'print', label: 'Print', hint: 'Print button and Ctrl+P', default: true },
    ],
    limits: { publicMb: 25, memberMb: 100 },
    related: ['sign-pdf', 'fill-pdf-form', 'edit-scanned-pdf', 'merge-pdf', 'compress-pdf'],
    keywords: ['pdf editor', 'edit pdf', 'edit pdf online', 'edit pdf text', 'pdf editor free', 'online pdf editor', 'free pdf editor no watermark', 'pdf editor online free', 'edit text in pdf', 'pdf editor without uploading'],
  },
  {
    slug: 'merge-pdf',
    category: 'pdf',
    no: 2,
    name: 'Merge PDF',
    short: 'Join several PDFs into one, in the order you want',
    title: 'Merge PDF Online – Combine PDF Files Free',
    description: 'Combine several PDF files into one document. Drag to reorder, add images too. Free, no sign-up, and files are merged on your own device.',
    h1: 'Merge PDF files',
    intro: 'Put several PDFs, and photos if you like, into one file. Reorder them before joining; form fields stay fillable in the merged copy.',
    steps: ['Add your PDF files (or drop them on the box).', 'Move them up or down until the order is right.', 'Press Merge and download the combined PDF.'],
    faqs: [
      { q: 'How many files can I merge?', a: 'As many as your device can hold in memory; dozens of ordinary PDFs are fine. The size limit per file is shown next to the box.' },
      { q: 'Can I merge a password-protected PDF?', a: 'Remove the password first with the PDF editor (it asks for it when you open the file), then merge.' },
      { q: 'Will links and form fields survive?', a: 'Form fields do. Bookmarks from the separate files are not combined into one table of contents.' },
    ],
    limits: { publicMb: 25, memberMb: 100 },
    related: ['split-pdf', 'compress-pdf', 'jpg-to-pdf', 'pdf-editor'],
    keywords: ['merge pdf', 'combine pdf', 'join pdf files', 'pdf merger'],
  },
  {
    slug: 'split-pdf',
    category: 'pdf',
    no: 3,
    name: 'Split PDF',
    short: 'Cut a PDF into several files by pages or ranges',
    title: 'Split PDF Online – Extract Pages or Split Every N Pages',
    description: 'Split a PDF every few pages, by page ranges such as 1-3, 4-8, or one file per page. Free, private, and downloaded together as a ZIP.',
    h1: 'Split a PDF into several files',
    intro: 'Choose how to cut: every N pages, one file per page, or your own ranges. You see exactly which files you will get before you download.',
    steps: ['Open the PDF.', 'Pick every N pages, every page, or type ranges like 1-3, 4-8, 9-.', 'Download the parts, together in one ZIP.'],
    faqs: [
      { q: 'How do I take out just a few pages?', a: 'Choose "By page ranges", type the pages you want (for example 4-6) and leave "the pages not listed" unticked. You get one PDF with only those pages.' },
      { q: 'What does 9- mean?', a: 'From page 9 to the last page.' },
    ],
    limits: { publicMb: 25, memberMb: 100 },
    related: ['merge-pdf', 'pdf-editor', 'compress-pdf'],
    keywords: ['split pdf', 'extract pages from pdf', 'separate pdf pages', 'pdf splitter'],
  },
  {
    slug: 'compress-pdf',
    category: 'pdf',
    no: 4,
    name: 'Compress PDF',
    short: 'Make a PDF smaller for email and upload limits',
    title: 'Compress PDF Online – Reduce PDF File Size Free',
    description: 'Reduce the size of a PDF by shrinking the photos inside it. Text stays sharp. Choose balanced or strong compression; free and private.',
    h1: 'Compress a PDF',
    intro: 'Most of a large PDF is usually its photos and scans. This tool redraws them at a sensible resolution and quality, while text and drawings are left exactly as they are.',
    steps: ['Open the PDF.', 'Choose Balanced (screen quality) or Strong (smallest, for email).', 'Compare the sizes and download.'],
    faqs: [
      { q: 'Why did my file not get much smaller?', a: 'If the PDF has no photos, or they are already small, there is little to gain: text and vector drawings are already compact.' },
      { q: 'Does compression blur the text?', a: 'No. Only photos and scanned page images are reduced; real text is untouched.' },
    ],
    limits: { publicMb: 25, memberMb: 150 },
    related: ['merge-pdf', 'compress-image', 'pdf-to-jpg'],
    keywords: ['compress pdf', 'reduce pdf size', 'pdf compressor', 'shrink pdf'],
  },
  {
    slug: 'rotate-pdf',
    category: 'pdf',
    no: 5,
    name: 'Rotate PDF',
    short: 'Turn pages that are sideways or upside down',
    title: 'Rotate PDF Online – Rotate Pages and Save Free',
    description: 'Rotate all pages or single pages of a PDF by 90 or 180 degrees and save the result. Free online, no upload.',
    h1: 'Rotate PDF pages',
    intro: 'Fix scans that came out sideways. Turn every page at once or only the ones that need it, then save the PDF the right way up.',
    steps: ['Open the PDF.', 'Turn all pages, or click the arrows under a single page.', 'Download the rotated PDF.'],
    faqs: [{ q: 'Is the rotation permanent?', a: 'Yes, the saved PDF opens with the pages turned in every PDF reader.' }, { q: 'Can I rotate just one page?', a: 'Yes. Use the arrows under that page; the other pages stay as they are.' }],
    limits: { publicMb: 25, memberMb: 100 },
    sections: [
      {
        h2: 'Turning one page or the whole document',
        list: [
          'All pages: Left, Right or 180° at the top turns every page together, for a scan fed in the wrong way round.',
          'Single pages: the arrows under a thumbnail turn only that page, for a landscape table inside a portrait report.',
          'Pages already saved sideways: the turn is added to the page’s current rotation, so they come back upright.',
        ],
        body: [
          'The pages are not redrawn: the PDF records the new orientation, so text stays selectable and nothing loses quality. To delete or reorder pages as well, open the file in the [PDF Editor](/pdf-editor), or take pages out with [Split PDF](/split-pdf).',
        ],
      },
    ],
    related: ['pdf-editor', 'split-pdf', 'merge-pdf'],
    keywords: ['rotate pdf', 'turn pdf pages', 'rotate pdf pages and save'],
  },
  {
    slug: 'jpg-to-pdf',
    category: 'pdf',
    no: 6,
    name: 'JPG to PDF',
    short: 'Turn photos and scans into one PDF',
    title: 'JPG to PDF Converter – Images to PDF Free',
    description: 'Convert JPG, PNG and WebP images into a single PDF, one page per image, in the order you choose. Free, no watermark, works on phones.',
    h1: 'Convert images to PDF',
    intro: 'Photographed documents, receipts or certificates become one tidy PDF. Pages are A4 at most and each picture fills its page.',
    steps: ['Add your images.', 'Reorder them.', 'Create the PDF and download it.'],
    faqs: [{ q: 'Which formats can I use?', a: 'JPG, PNG and WebP. HEIC photos from iPhones should be shared as JPG first (iPhone does this when you choose "Most compatible").' }, { q: 'Is there a watermark or a page limit?', a: 'No watermark, and each image you add becomes one page.' }],
    limits: { publicMb: 20, memberMb: 60 },
    sections: [
      {
        h2: 'Making one document from phone photos',
        list: [
          'Order: the first image becomes page 1; move images up or down with the arrows before creating the PDF.',
          'Upright pages: photos taken with the phone turned are straightened the way the camera recorded them.',
          'Page size: pages are at most A4 and each picture fills its page without being stretched.',
          'Upload limits: shrink the photos first with [Compress Image](/compress-image), or the finished PDF with [Compress PDF](/compress-pdf).',
        ],
        body: ['Screenshots and PNG files work the same way; see [PNG to PDF](/png-to-pdf). To add these pages to an existing PDF, create the PDF here and join the two with [Merge PDF](/merge-pdf).'],
      },
    ],
    related: ['merge-pdf', 'compress-image', 'pdf-to-jpg'],
    keywords: ['jpg to pdf', 'image to pdf', 'png to pdf', 'photo to pdf'],
  },
  {
    slug: 'pdf-to-jpg',
    category: 'pdf',
    no: 7,
    name: 'PDF to JPG',
    short: 'Save each PDF page as a picture',
    title: 'PDF to JPG Converter – Save PDF Pages as Images',
    description: 'Convert every page of a PDF into a JPG or PNG image at the resolution you choose. Several pages download as one ZIP. Free and private.',
    h1: 'Convert PDF pages to images',
    intro: 'Useful for sharing a page on WhatsApp, putting a page into a presentation, or uploading a document where only images are accepted.',
    steps: ['Open the PDF.', 'Choose JPG or PNG and a resolution.', 'Download one image, or a ZIP for several pages.'],
    faqs: [{ q: 'Which resolution should I choose?', a: '150 dpi is right for screens and messages; 300 dpi for printing.' }, { q: 'Can I convert only one page?', a: 'Take that page out with [Split PDF](/split-pdf) first, then convert it; a single page downloads as one image.' }],
    limits: { publicMb: 25, memberMb: 100 },
    sections: [
      {
        h2: 'Choosing the format and resolution',
        list: [
          'JPG: the smallest files; right for scanned pages and photos you send on WhatsApp or by email.',
          'PNG: perfectly sharp text and lines; right for slides and documents. See [PDF to PNG](/pdf-to-png).',
          '96 dpi: quick previews. 150 dpi: screens and messages. 300 dpi: printing and zooming in.',
        ],
        body: ['A PDF with several pages comes back as one ZIP with an image per page, named by page number. To convert only a few pages, take them out first with [Split PDF](/split-pdf).'],
      },
    ],
    related: ['jpg-to-pdf', 'compress-image', 'split-pdf'],
    keywords: ['pdf to jpg', 'pdf to image', 'pdf to png', 'convert pdf to jpg'],
  },
  {
    slug: 'protect-pdf',
    category: 'pdf',
    no: 8,
    name: 'Protect PDF',
    short: 'Add a password to a PDF',
    title: 'Protect PDF with Password – Encrypt PDF Online Free',
    description: 'Lock a PDF with a password using AES-256 encryption. Optionally block printing or copying. Free, and the password never leaves your device.',
    h1: 'Password-protect a PDF',
    intro: 'Choose a password and the PDF is encrypted with AES-256. Anyone opening it needs the password; without it the contents cannot be read.',
    steps: ['Open the PDF.', 'Type a password (twice).', 'Download the protected copy.'],
    faqs: [
      { q: 'What if I forget the password?', a: 'It cannot be recovered: that is the point of the encryption. Keep it somewhere safe.' },
      { q: 'Is the password sent to Toolyverse?', a: 'No. The encryption happens in your browser.' },
    ],
    limits: { publicMb: 25, memberMb: 100 },
    sections: [
      {
        h2: 'What the protection does',
        list: [
          'Password to open: nobody can read the file without it. Right for salary slips, bank statements, ID copies and contracts.',
          'No printing or no copying: optional extra limits for people who do open it. Most PDF readers respect them.',
          'AES-256 encryption: the strongest standard PDF encryption, opened by Acrobat, browsers and phone PDF apps.',
        ],
        body: ['Keep the password safe: it is used only on your device and never sent to us, so a lost password cannot be recovered by anyone. To take the password off a PDF you can open, load it in the [PDF Editor](/pdf-editor) and download it again.'],
      },
    ],
    related: ['pdf-editor', 'compress-pdf', 'merge-pdf'],
    keywords: ['protect pdf', 'password protect pdf', 'encrypt pdf', 'lock pdf'],
  },

  // ---- Images ------------------------------------------------------------------------------------
  {
    slug: 'compress-image',
    category: 'image',
    no: 9,
    name: 'Compress Image',
    short: 'Make a JPG or PNG smaller, down to a target KB',
    title: 'Compress Image Online – Reduce JPG Size to 50 KB, 100 KB',
    description: 'Reduce image size to a target such as 20 KB, 50 KB or 100 KB for online forms, or by quality. Compare before and after. Free and private.',
    h1: 'Compress an image',
    intro: 'Set a target size, for example 50 KB for an exam form, and the tool finds the best quality that fits. Or choose the quality yourself and watch the size change.',
    steps: ['Choose an image.', 'Pick a target size in KB, or a quality.', 'Check the preview and download.'],
    faqs: [
      { q: 'Why can\'t it reach my target size?', a: 'A very large photo may need to be made smaller in pixels too. Turn on "Also reduce dimensions" or use Resize Image first.' },
      { q: 'Does it work for PNG?', a: 'Yes. PNGs with photos are saved as JPG or WebP to get small; screenshots and logos stay PNG.' },
    ],
    limits: { publicMb: 15, memberMb: 50 },
    related: ['resize-image', 'convert-image', 'crop-image'],
    keywords: ['compress image', 'reduce image size', 'image to 50kb', 'compress jpg'],
  },
  {
    slug: 'resize-image',
    category: 'image',
    no: 10,
    name: 'Resize Image',
    short: 'Change the width and height in pixels, cm or percent',
    title: 'Resize Image Online – Change Pixels, CM or Percent',
    description: 'Resize photos to exact pixels, centimetres at a DPI, or a percentage, keeping the proportions if you want. Free online image resizer.',
    h1: 'Resize an image',
    intro: 'Make a photo exactly 600 × 600 pixels, 3.5 × 4.5 cm for a passport-style photo, or half its size, with a live preview.',
    steps: ['Choose an image.', 'Enter the new size in pixels, cm or percent.', 'Download the resized image.'],
    faqs: [{ q: 'How do I keep the photo from stretching?', a: 'Leave "Keep proportions" on; changing the width then sets the height for you.' }, { q: 'How do I resize a photo to a KB size?', a: 'Resize to the pixels first, then use [Compress Image](/compress-image) with the KB limit, for example [50 KB](/compress-image-to-50kb).' }],
    limits: { publicMb: 15, memberMb: 50 },
    sections: [
      {
        h2: 'Pixels, centimetres or percent',
        list: [
          'Pixels: what online forms and websites ask for, for example 200 × 230 for a form photo.',
          'Centimetres: for prints, such as 3.5 × 4.5 cm for a passport-size photo, at the DPI you set (300 for photo prints). Common print sizes are one click away.',
          'Percent: make a photo half or a quarter of its size in one step.',
        ],
        body: ['Resizing changes the pixels, not directly the KB. If the form also gives a maximum file size, finish with [Compress Image](/compress-image). Enlarging a small picture cannot add detail, so start from the biggest original you have.'],
      },
    ],
    related: ['compress-image', 'crop-image', 'convert-image'],
    keywords: ['resize image', 'image resizer', 'resize photo in cm', 'change image size'],
  },
  {
    slug: 'crop-image',
    category: 'image',
    no: 11,
    name: 'Crop Image',
    short: 'Cut out part of a photo, freely or to a ratio',
    title: 'Crop Image Online – Free Photo Cropper with Ratios',
    description: 'Crop a photo freehand or to 1:1, 4:3, 16:9 or passport ratio, and rotate it. Free online cropper that keeps your images on your device.',
    h1: 'Crop an image',
    intro: 'Drag the frame over the part you want to keep. Lock it to a ratio for profile pictures, banners or passport photos.',
    steps: ['Choose an image.', 'Drag the frame and pick a ratio if needed.', 'Download the cropped image.'],
    faqs: [{ q: 'Does cropping reduce quality?', a: 'No, the kept part is saved at its original resolution.' }, { q: 'Can I crop on my phone?', a: 'Yes. Move the frame and its corners with your finger.' }],
    limits: { publicMb: 15, memberMb: 50 },
    sections: [
      {
        h2: 'Which ratio for what',
        list: [
          '1:1: profile pictures for WhatsApp, Instagram and LinkedIn.',
          '4:3 and 3:4: standard photo prints and most phone photos.',
          '16:9: YouTube thumbnails, banners and slides.',
          'Passport 35×45: Indian passport-size photos; see [Passport Size Photo](/passport-size-photo).',
          'Free: any shape you drag.',
        ],
        body: ['Drag inside the frame to move it and drag a corner to resize it; with a ratio chosen the shape stays fixed. Rotate 90° first if the photo is sideways. The kept part is saved at full resolution, so [resize](/resize-image) or [compress](/compress-image) it afterwards if a form needs a smaller file.'],
      },
    ],
    related: ['resize-image', 'compress-image', 'convert-image'],
    keywords: ['crop image', 'crop photo online', 'image cropper'],
  },
  {
    slug: 'convert-image',
    category: 'image',
    no: 12,
    name: 'Convert Image',
    short: 'Change between JPG, PNG and WebP',
    title: 'Image Converter – JPG to PNG, PNG to JPG, WebP to JPG',
    description: 'Convert images between JPG, PNG and WebP, several at once. Choose quality and background colour for transparent images. Free and private.',
    h1: 'Convert image format',
    intro: 'Turn WebP downloads into JPG, screenshots into PNG, or photos into WebP for a faster website. Several images at once come back in one ZIP.',
    steps: ['Add one or more images.', 'Choose the format and quality.', 'Download.'],
    faqs: [{ q: 'What happens to transparency when converting to JPG?', a: 'JPG has no transparency, so transparent areas are filled with the background colour you pick (white by default).' }, { q: 'Can I convert many images at once?', a: 'Yes. Add them all; they come back together in one ZIP file.' }],
    limits: { publicMb: 15, memberMb: 50 },
    sections: [
      {
        h2: 'Which format to choose',
        list: [
          'JPG: photos for forms, email and printing; accepted everywhere.',
          'PNG: screenshots, logos and anything with sharp edges or a transparent background.',
          'WebP: pictures for your own website; about a quarter smaller than JPG at the same quality.',
        ],
        body: ['The common conversions have their own pages: [PNG to JPG](/png-to-jpg), [JPG to PNG](/jpg-to-png) and [WebP to JPG](/webp-to-jpg). The converter also reads GIF, BMP and AVIF files.'],
      },
    ],
    related: ['compress-image', 'resize-image', 'jpg-to-pdf'],
    keywords: ['webp to jpg', 'png to jpg', 'jpg to png', 'image converter'],
  },

  {
    slug: 'image-to-text',
    category: 'image',
    no: 43,
    name: 'Image to Text',
    short: 'Extract text from photos, scans and screenshots (OCR)',
    title: 'Image to Text Converter – Extract Text from Image, Free',
    description: 'Extract text from images, photos and screenshots online with OCR, in English and Hindi. Copy it or download a .txt file. Free, private, no upload.',
    h1: 'Image to Text: extract text from a picture',
    intro:
      'Turn a photo of a page, a scanned document or a screenshot into text you can copy, edit and search. Drop or paste the image and the text appears beside it in seconds, in English, Hindi or both. Words the reader was unsure about are outlined on the picture, so you know exactly what to check. Everything runs in your browser: your images are never uploaded.',
    steps: [
      'Choose the language of the text (English, Hindi, or both).',
      'Drop images, choose them, or paste a screenshot with Ctrl+V. Several images can be read in one go.',
      'Check the outlined words, edit the text if needed, then copy it or download a .txt file.',
    ],
    sections: [
      {
        h2: 'What you can turn into text',
        list: [
          'Photos of documents: letters, notices, book pages, receipts and bills photographed with a phone.',
          'Screenshots: text in an app, a chat, an error message or a web page that cannot be selected. See [Screenshot to Text](/screenshot-to-text).',
          'Scans: JPG or PNG scans of printed pages. For a scanned PDF, use [Edit Scanned PDF](/edit-scanned-pdf), which keeps the page and adds searchable text to it.',
          'Hindi text: printed Devanagari, including matras and joined letters. See [Hindi Image to Text](/hindi-image-to-text).',
          'Many images at once: read a whole batch and get all the text in one place, each part headed with its file name.',
        ],
      },
      {
        h2: 'How to get the most accurate text',
        list: [
          'Photograph straight on: hold the phone parallel to the page, in good light, without shadows across the text.',
          'Crop to the text: borders, hands and backgrounds can confuse the reader. Use [Crop Image](/crop-image) first if needed.',
          'Pick the right language: choose “English + Hindi” when a page mixes both.',
          'Use “Improve faint text”: it is on by default and helps with pale, coloured or low-contrast print. Turn it off for clean screenshots if results look worse.',
          'Check the outlined words: names, numbers and amounts matter most, so look at those before you rely on the text.',
        ],
      },
      {
        h2: 'Private by design',
        body: [
          'Most image-to-text websites upload your picture to their server and read it there. Here, the text reader (Tesseract OCR, the open-source engine also used by many professional tools) is downloaded to your browser once and runs on your own computer or phone. Your images never leave your device, which matters for bills, letters, ID documents and anything personal.',
        ],
      },
      {
        h2: 'Image to text compared',
        table: {
          head: ['', 'Toolyverse Image to Text', 'Typical online OCR sites', 'Copying the text by hand'],
          rows: [
            ['Where your image goes', 'Stays on your device', 'Uploaded to their server', 'Nowhere'],
            ['Hindi', 'Yes, with English on the same page', 'Often English only', 'Slow to type'],
            ['Several images at once', 'Yes', 'Often one per go, or paid', 'n/a'],
            ['Shows what to check', 'Unsure words outlined on the image', 'Rarely', 'n/a'],
            ['Price', 'Free', 'Free with limits or ads', 'Your time'],
          ],
        },
      },
    ],
    faqs: [
      { q: 'Is this image to text converter free?', a: 'Yes, completely, with no sign-up and no limit on how many images you read. A free account only raises the file size limit.' },
      { q: 'Are my images uploaded?', a: 'No. The text is read inside your browser. Your images stay on your device and nothing is sent to Toolyverse.' },
      { q: 'Which languages can it read?', a: 'English and Hindi, on their own or together on the same image.' },
      { q: 'Can it read handwriting?', a: 'Printed and typed text works best. Neat handwriting is sometimes partly read, but expect mistakes and check the result.' },
      { q: 'How accurate is it?', a: 'Clear printed text and screenshots are usually read almost perfectly. Blurry, angled or low-light photos give more mistakes; the tool shows how sure it was and outlines the words to check.' },
      { q: 'Can I extract text from a PDF?', a: 'Yes, with [Edit Scanned PDF](/edit-scanned-pdf) for scans, which makes the whole PDF searchable. For a single page, [PDF to JPG](/pdf-to-jpg) followed by this tool also works.' },
      { q: 'Does the layout stay the same?', a: 'Lines and paragraphs are kept, and spacing between columns is preserved as spaces. Tables come out as text in rows, not as a spreadsheet.' },
      { q: 'Why is the first image slower?', a: 'The first time, your browser downloads the text reader and the language data (a few megabytes). After that it is ready at once.' },
    ],
    featureList: [
      'Extract text from JPG, PNG, WebP, BMP and GIF images',
      'Paste screenshots with Ctrl+V',
      'English and Hindi OCR, also mixed',
      'Read many images in one go',
      'Outlines the words to check on the image',
      'Improve faint or low-contrast text',
      'Copy or download as .txt',
      'Runs in the browser, no upload',
    ],
    features: [{ key: 'batch', label: 'Several images at once', hint: 'Choose or paste many images and read them in one go', default: true }],
    limits: { publicMb: 15, memberMb: 50 },
    related: ['screenshot-to-text', 'hindi-image-to-text', 'edit-scanned-pdf', 'crop-image'],
    alternates: { 'hi-IN': '/hindi-image-to-text' },
    keywords: [
      'image to text',
      'image to text converter',
      'extract text from image',
      'photo to text',
      'jpg to text',
      'ocr online',
      'picture to text',
      'copy text from image',
      'screenshot to text',
      'image to text online free',
    ],
  },

  // ---- GST ---------------------------------------------------------------------------------------
  {
    slug: 'gst-calculator',
    category: 'gst',
    no: 13,
    name: 'GST Calculator',
    short: 'Add or remove GST and split it into CGST, SGST or IGST',
    title: 'GST Calculator – Inclusive & Exclusive, CGST SGST IGST',
    description: 'Calculate GST on any amount at 5%, 12%, 18%, 28% or a custom rate. Find the price before GST, and the CGST, SGST or IGST split. Free.',
    h1: 'GST calculator',
    intro: 'Enter an amount and a rate. "Add GST" gives the price including tax; "Remove GST" works backwards from a price that already includes it. The tax is split into CGST and SGST for a sale within your state, or shown as IGST for another state.',
    steps: ['Type the amount.', 'Choose the GST rate and whether to add or remove GST.', 'Read the tax, the total and the CGST/SGST or IGST split.'],
    faqs: [
      { q: 'How is GST removed from an inclusive price?', a: 'Price before GST = inclusive price × 100 ÷ (100 + rate). For ₹1,180 at 18%: 1,180 × 100 ÷ 118 = ₹1,000, so the GST is ₹180.' },
      { q: 'When is it CGST + SGST and when IGST?', a: 'A sale within the same state carries CGST and SGST, each half of the rate. A sale to another state, or an import, carries IGST at the full rate.' },
      { q: 'Which rates can I use?', a: 'The usual slabs are listed, and you can type any other rate, for example 3% for gold or 0.25% for rough diamonds.' },
    ],
    related: ['gst-invoice-generator', 'gstin-validator', 'number-to-words'],
    keywords: ['gst calculator', 'gst inclusive calculator', 'reverse gst calculator', 'cgst sgst calculator'],
  },
  {
    slug: 'gstin-validator',
    category: 'gst',
    no: 14,
    name: 'GSTIN Checker',
    short: 'Check a GST number\'s format, state and check digit',
    title: 'GSTIN Validator – Check GST Number Format and State',
    description: 'Verify that a GSTIN is correctly formed: state code, PAN, entity number and check digit. Find the state and PAN in it. Free GST number checker.',
    h1: 'Check a GSTIN',
    intro: 'A GSTIN has 15 characters and its last one is a check digit worked out from the others, so most typing mistakes can be caught offline. Paste one or many numbers to check them.',
    steps: ['Paste a GSTIN (or a list, one per line).', 'See whether each one is valid, with its state and PAN.', 'Fix or copy the valid ones.'],
    faqs: [
      { q: 'Does a valid result mean the business is registered?', a: 'It means the number is correctly formed. Whether it is active, and the business name, can only be confirmed on the official GST portal\'s "Search Taxpayer" page.' },
      { q: 'What do the 15 characters mean?', a: 'Two digits for the state, the ten-character PAN, one character for the registration number under that PAN, the letter Z by default, and a check character.' },
    ],
    related: ['gst-calculator', 'gst-invoice-generator'],
    keywords: ['gstin validator', 'gst number check', 'verify gstin', 'gstin format'],
  },
  {
    slug: 'gst-invoice-generator',
    category: 'gst',
    no: 15,
    name: 'GST Invoice Maker',
    short: 'Create a GST tax invoice and save it as PDF',
    title: 'GST Invoice Generator – Free Tax Invoice Format, Print or PDF',
    description: 'Make a GST tax invoice with GSTIN, HSN, CGST/SGST or IGST, totals in words, and print or save it as PDF. Free, no sign-up needed.',
    h1: 'Make a GST invoice',
    intro: 'Fill in your business, the customer and the items. Tax is split into CGST and SGST or IGST automatically from the two states, and the total is written in words. Print it or save it as a PDF.',
    steps: ['Enter your details and the customer\'s.', 'Add items with HSN/SAC, quantity, rate and GST %.', 'Print, or choose "Save as PDF" in the print dialog.'],
    faqs: [
      { q: 'Does the invoice include everything GST rules ask for?', a: 'It includes the supplier and recipient names, addresses and GSTINs, invoice number and date, place of supply, HSN/SAC, quantities, values, rates and tax amounts. Check any extra requirements for your trade with your accountant.' },
      { q: 'Are my business details saved?', a: 'Signed-in members can save their business details and invoice number sequence. Otherwise they are kept only in this browser.' },
    ],
    features: [{ key: 'saveBusiness', label: 'Save business details', hint: 'Remember the seller details and next invoice number', default: true }],
    related: ['gst-calculator', 'gstin-validator', 'number-to-words'],
    keywords: ['gst invoice generator', 'gst invoice format', 'tax invoice maker', 'free gst bill'],
  },

  {
    slug: 'gstr1-to-excel',
    category: 'gst',
    no: 21,
    name: 'GSTR-1 to Excel',
    short: 'Many GSTR-1 PDFs into one checked Excel workbook',
    title: 'GSTR-1 PDF to Excel – Bulk Convert, Month-wise per GSTIN',
    description: 'Convert GSTR-1 PDFs from the GST portal into one Excel: month-wise per GSTIN, all GSTINs for the year, every line. Each return is checked. Free, no upload.',
    h1: 'GSTR-1 PDFs to Excel',
    intro:
      'Drop the GSTR-1 PDFs you downloaded from the portal, for any number of GSTINs and months. Each return is read and checked: its tables must add up to the Total Liability printed in it, and the HSN summary must agree. You get one workbook with a coverage grid, a month-wise sheet per GSTIN and every line of every return.',
    steps: [
      'Download GSTR-1 PDFs from the portal: Returns dashboard → GSTR-1 → View → Download PDF.',
      'Drop them all here together. GSTIN, financial year and month are read from inside each PDF.',
      'Check the coverage grid for missing months and the notes on any return, then download the Excel file.',
    ],
    faqs: [
      { q: 'Are my returns uploaded anywhere?', a: 'No. The PDFs are read by your browser on your own computer. Nothing is sent to Toolyverse or anyone else.' },
      { q: 'What does "Check notes" on a return mean?', a: 'The figures in that return did not add up the way they should, for example the tables differ from the printed Total Liability. Open that return on the portal and look at the sections named in the note.' },
      { q: 'Can it read a scanned GSTR-1?', a: 'No. It needs the PDF as downloaded from the GST portal, which contains real text. A scan or a photo of a return cannot be read.' },
      { q: 'What happens if I load the same month twice?', a: 'Both are listed, and the one with the later ARN date is used, so a revised download replaces the earlier one.' },
    ],
    features: [{ key: 'detailSheet', label: 'Detail sheet', hint: 'Offer the sheet with every line of every return', default: true }],
    limits: { publicMb: 10, memberMb: 25 },
    related: ['gstr1-vs-gstr3b', 'gstr3b-to-excel', 'gstr2b-merger'],
    keywords: ['gstr1 to excel', 'gstr-1 pdf to excel', 'gstr1 summary excel', 'gstr 1 annual summary'],
  },
  {
    slug: 'gstr3b-to-excel',
    category: 'gst',
    no: 22,
    name: 'GSTR-3B to Excel',
    short: 'Many GSTR-3B PDFs into one Excel: tax, ITC and cash paid',
    title: 'GSTR-3B PDF to Excel – Bulk Convert, ITC & Tax Paid Monthly',
    description: 'Convert GSTR-3B PDFs into one Excel: outward tax, ITC, interest and tax paid in cash, month-wise per GSTIN. Each return is checked. Free and private.',
    h1: 'GSTR-3B PDFs to Excel',
    intro:
      'Turn a year of GSTR-3B returns into one workbook: outward supplies, input tax credit, interest and tax paid through ITC and in cash, month by month. Every return is checked: 4A − 4B must equal 4C, tax payable must agree with Table 3.1, and ITC used plus cash must equal the tax payable.',
    steps: [
      'Download GSTR-3B PDFs from the portal: Returns dashboard → GSTR-3B → Download filed GSTR-3B.',
      'Drop them all here together; GSTINs, months and years are sorted automatically.',
      'Check the coverage grid and any notes, then download the Excel file.',
    ],
    faqs: [
      { q: 'What is in the Excel file?', a: 'A list of the returns read, a coverage grid, all GSTINs for the year side by side, one month-wise sheet per GSTIN, the tax liability breakup printed in each return, and optionally every figure of every return.' },
      { q: 'Why does a return show "Check notes"?', a: 'Its own figures do not agree, for example net ITC is not 4A minus 4B, or tax paid does not equal tax payable. The note names the heads that differ.' },
      { q: 'Does it work for quarterly (QRMP) returns?', a: 'Yes, the tax period is read from the return; quarterly returns are placed at the last month of their quarter.' },
    ],
    features: [{ key: 'detailSheet', label: 'Detail sheet', hint: 'Offer the sheet with every figure of every return', default: true }],
    limits: { publicMb: 10, memberMb: 25 },
    related: ['gstr1-vs-gstr3b', 'gstr1-to-excel', 'gst-calculator'],
    keywords: ['gstr3b to excel', 'gstr-3b pdf to excel', 'gstr3b summary', 'itc summary excel'],
  },
  {
    slug: 'gstr1-vs-gstr3b',
    category: 'gst',
    no: 23,
    name: 'GSTR-1 vs GSTR-3B',
    short: 'Reconcile GSTR-1 with GSTR-3B, month by month and table by table',
    title: 'GSTR-1 vs GSTR-3B Reconciliation – Free, Month-wise, Excel',
    description: 'Reconcile GSTR-1 with GSTR-3B from the portal PDFs: taxable value, IGST, CGST, SGST and cess, month by month with a year view and an Excel of every difference.',
    h1: 'Reconcile GSTR-1 with GSTR-3B',
    intro:
      'Drop GSTR-1 and GSTR-3B PDFs together, for any GSTINs and months. They are paired by GSTIN and month and compared table by table: taxable supplies, zero-rated, nil and exempt, non-GST, e-commerce supplies and total liability, for taxable value, IGST, CGST, SGST and cess. Differences are shown as GSTR-3B minus GSTR-1.',
    steps: [
      'Download both returns for the months you need from the GST portal as PDFs.',
      'Drop them all here together; set the difference you can ignore (₹1 by default).',
      'Click a GSTIN and a month to see both returns side by side, then download the Excel file.',
    ],
    faqs: [
      { q: 'Which figures are compared?', a: '3.1(a) is compared with B2B, B2CL, B2CS and deemed exports including credit/debit notes, amendments and advances; 3.1(b) with exports and SEZ; 3.1(c) and 3.1(e) with Table 8; 3.1.1 with Tables 14 and 15; and the total liability. The full list is shown before you load files.' },
      { q: 'What does a positive difference mean?', a: 'More was reported in GSTR-3B than in GSTR-1 for that head and month. A negative difference means GSTR-1 shows more.' },
      { q: 'Can I reconcile GSTR-2B with GSTR-3B here?', a: 'Not yet. Use the GSTR-2B Merger to collect your 2B data in one workbook for now.' },
    ],
    limits: { publicMb: 10, memberMb: 25 },
    related: ['gstr1-to-excel', 'gstr3b-to-excel', 'gstr2b-merger'],
    keywords: ['gstr1 vs gstr3b reconciliation', 'gstr 1 and 3b reconciliation', 'gst reconciliation excel', 'gstr3b vs gstr1'],
  },
  {
    slug: 'gstr2b-merger',
    category: 'gst',
    no: 24,
    name: 'GSTR-2B Merger',
    short: 'Add GSTR-2B Excel downloads to one merged workbook',
    title: 'GSTR-2B Merger – Combine GSTR-2B Excel Files (B2B, B2BA, CDNR)',
    description: 'Merge GSTR-2B Excel downloads from the GST portal into one workbook: B2B, B2BA and B2B-CDNR rows with state and month added. Refresh months safely. Free.',
    h1: 'Merge GSTR-2B Excel files',
    intro:
      'Keep one running workbook of your GSTR-2B data. Drop your merged file (or start fresh) and the GSTR-2B Excel files from the portal, for any months and states. B2B, B2BA and B2B-CDNR rows come across with the State and GSTR-2B Month filled in; a month you load again replaces its old rows instead of doubling them.',
    steps: [
      'Optional: choose your existing merged GSTR-2B workbook.',
      'Add the GSTR-2B Excel downloads exactly as they come from the portal, and name the state for each GSTIN once.',
      'Check the state × month grid, then merge and download.',
    ],
    faqs: [
      { q: 'What if the portal changes the GSTR-2B Excel layout?', a: 'Each sheet is checked for the expected columns. If they moved, that sheet is skipped and flagged rather than putting values in the wrong columns.' },
      { q: 'Do I have to type the state names every time?', a: 'No. They are remembered for each GSTIN; signed-in members keep them on their account, so they work on any device.' },
      { q: 'Are the tax totals shown for checking?', a: 'Yes. The IGST, CGST and SGST of B2B invoices are totalled per file so you can tick them against the ITC Available summary on the portal.' },
    ],
    features: [{ key: 'saveStateNames', label: 'Remember state names', hint: 'Remember the state name typed for each GSTIN', default: true }],
    limits: { publicMb: 15, memberMb: 50 },
    related: ['gstr1-vs-gstr3b', 'gstr3b-to-excel', 'gstin-validator'],
    keywords: ['gstr2b merger', 'merge gstr 2b excel', 'gstr2b combine', 'gstr 2b consolidated'],
  },

  // ---- Converters --------------------------------------------------------------------------------
  {
    slug: 'unit-converter',
    category: 'convert',
    no: 16,
    name: 'Unit Converter',
    short: 'Length, weight, area, volume, temperature and more',
    title: 'Unit Converter – Length, Weight, Area, Temperature',
    description: 'Convert between metric, imperial and Indian units: km, miles, kg, pounds, acres, bigha, gaj, litres, gallons, °C and °F. Instant and free.',
    h1: 'Unit converter',
    intro: 'Type a value in any box and every other unit updates. Indian land units (gaj, bigha, guntha) are included with the values most commonly used; bigha varies by state, so its size is shown.',
    steps: ['Choose what you are measuring.', 'Type a number in any unit.', 'Read the others, or copy one.'],
    faqs: [{ q: 'How big is a bigha?', a: 'It differs by state. The converter uses 1,600 square yards (about 0.33 acre), common in Rajasthan and Punjab, and tells you so.' }, { q: 'How many square feet are in a gaj?', a: 'One square gaj (square yard) is 9 square feet.' }],
    sections: [
      {
        h2: 'Indian land measurement',
        list: [
          'Gaj: one square yard (about 0.836 square metre); plot sizes in north India are usually given in gaj.',
          'Guntha: 121 square yards, common in Maharashtra, Gujarat and Karnataka; 40 guntha make an acre.',
          'Bigha: differs from state to state. The converter uses 1,600 square yards and shows this next to the result.',
          'Acre and hectare: one hectare is about 2.47 acres.',
        ],
        body: ['Before buying or selling land, confirm the local value of bigha or other regional units with the land records office, since the same name can mean quite different areas in neighbouring districts.'],
      },
    ],
    related: ['number-to-words', 'age-calculator', 'case-converter'],
    keywords: ['unit converter', 'cm to inches', 'kg to pounds', 'acre to bigha'],
  },
  {
    slug: 'number-to-words',
    category: 'convert',
    no: 17,
    name: 'Number to Words',
    short: 'Write amounts in words, in lakh/crore or million style',
    title: 'Number to Words – Rupees in Words (Lakh, Crore) Converter',
    description: 'Convert a number or amount into words in Indian style (lakh, crore) or international style (million). Rupees and paise for cheques and invoices.',
    h1: 'Write a number in words',
    intro: 'For cheques, invoices and agreements: 12,34,567.50 becomes "Rupees Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven and Fifty Paise Only".',
    steps: ['Type the number.', 'Choose Indian or international style, and rupees if you need them.', 'Copy the words.'],
    faqs: [{ q: 'What is the largest number it handles?', a: 'Up to 99,99,99,99,99,99,999 in Indian style (99 lakh crore and more) and up to the trillions in international style.' }, { q: 'Is it written lakh or lac?', a: 'Lakh, the spelling used by the Reserve Bank of India and in official documents.' }],
    sections: [
      {
        h2: 'Writing the amount on a cheque',
        list: [
          'Indian style: lakh and crore, as banks expect: 1,50,000 is One Lakh Fifty Thousand.',
          'Paise: decimals add "and Fifty Paise" after the rupees.',
          '"Only" at the end: closes the amount so nothing can be added after it.',
          'International style: million and billion, for documents for clients abroad.',
        ],
        body: ['Choose Title case, CAPITALS or lower case to match the document. The [GST Invoice Maker](/gst-invoice-generator) writes the invoice total in words for you.'],
      },
    ],
    related: ['gst-invoice-generator', 'gst-calculator', 'unit-converter'],
    keywords: ['number to words', 'amount in words', 'rupees in words', 'number to words indian'],
  },
  {
    slug: 'age-calculator',
    category: 'convert',
    no: 18,
    name: 'Age Calculator',
    short: 'Exact age in years, months and days on any date',
    title: 'Age Calculator – Exact Age in Years, Months and Days',
    description: 'Find your exact age, or the gap between two dates, in years, months and days, plus total days and the next birthday. Free age calculator.',
    h1: 'Age calculator',
    intro: 'Work out an age on a particular date (for example the cut-off date of an exam), or the time between any two dates.',
    steps: ['Enter the date of birth.', 'Change "age on" if you need a date other than today.', 'Read years, months, days and the totals.'],
    faqs: [{ q: 'How are months counted?', a: 'As calendar months: from 15 January to 15 February is one month, whatever the number of days.' }, { q: 'Are leap years counted?', a: 'Yes. Days are counted on the real calendar, including 29 February.' }],
    sections: [
      {
        h2: 'Age on an exam’s cut-off date',
        body: [
          'Recruitment and admission notices set the age limit on a particular date, often the first day of a month in the exam year. Enter your date of birth and set "age on" to that date to see exactly how old you will be then, in years, months and days.',
          'It works for any two dates: a notice period, the length of a loan, or the days left until a deadline. The total in days and the next birthday are shown too.',
        ],
      },
    ],
    related: ['unit-converter', 'number-to-words'],
    keywords: ['age calculator', 'calculate age from date of birth', 'date difference'],
  },
  {
    slug: 'case-converter',
    category: 'convert',
    no: 19,
    name: 'Case Converter',
    short: 'UPPER, lower, Title and Sentence case in one click',
    title: 'Case Converter – Uppercase, Lowercase, Title Case Online',
    description: 'Change text to UPPERCASE, lowercase, Title Case, Sentence case or camelCase, and clean extra spaces. Free online text case converter.',
    h1: 'Change text case',
    intro: 'Paste text and switch it between cases without retyping. Useful for headings, spreadsheets and text copied from PDFs that arrived in capitals.',
    steps: ['Paste your text.', 'Click the case you want.', 'Copy the result.'],
    faqs: [{ q: 'Does Title Case keep short words lower-case?', a: 'Yes: a, an, the, and, of, in and similar words stay lower-case unless they start the title.' }, { q: 'Is my text saved anywhere?', a: 'No. The text is changed in your browser and is not sent to us.' }],
    sections: [
      {
        h2: 'Which case for what',
        list: [
          'Sentence case: normal writing, for text that arrived in capitals.',
          'Title Case: headings and the names of books, reports and courses.',
          'UPPERCASE: form fields and labels that must be in capitals.',
          'lowercase: email addresses and user names.',
          'camelCase: names in programming code.',
        ],
        body: ['Extra spaces and broken lines, common in text copied from PDFs, can be cleaned in the same step. Count the result with the [Word Counter](/word-counter).'],
      },
    ],
    related: ['word-counter', 'number-to-words'],
    keywords: ['case converter', 'uppercase to lowercase', 'title case converter'],
  },
  {
    slug: 'word-counter',
    category: 'convert',
    no: 20,
    name: 'Word Counter',
    short: 'Words, characters, sentences and reading time',
    title: 'Word Counter – Count Words and Characters Online',
    description: 'Count words, characters with and without spaces, sentences, paragraphs and reading time as you type. Works with Hindi and other languages.',
    h1: 'Count words and characters',
    intro: 'Type or paste text to see its length as you write: handy for essays, social posts, meta descriptions and application forms with word limits.',
    steps: ['Type or paste text.', 'Read the counts as they update.'],
    faqs: [{ q: 'Does it count Hindi words correctly?', a: 'Yes, words are counted by spaces and punctuation in any script, and characters are counted as you see them.' }, { q: 'Are spaces counted as characters?', a: 'Both totals are shown: characters with spaces and without.' }],
    sections: [
      {
        h2: 'Common limits to check against',
        list: [
          'Meta description: about 150 to 160 characters before search engines cut it off.',
          'Post on X: 280 characters.',
          'Essays and statements of purpose: often 500 to 1,000 words; check the instructions.',
          'Application form answers: many count characters including spaces.',
        ],
        body: ['Reading time assumes 220 words a minute, so a 1,000-word article takes about four and a half minutes; speaking time assumes 140 words a minute, handy for timing a speech.'],
      },
    ],
    related: ['case-converter'],
    keywords: ['word counter', 'character counter', 'count words online'],
  },
];

// Landing pages for each PDF editor search intent (sign, fill forms, OCR, redact...), and for
// the exact searches people make for the other tools (compress to 20 KB, PNG to JPG...).
TOOLS.push(...EDITOR_PAGES, ...LANDING_PAGES);

export const toolBySlug = new Map(TOOLS.map((t) => [t.slug, t]));
export const categoryById = new Map(CATEGORIES.map((c) => [c.id, c]));
export const categoryBySlug = new Map(CATEGORIES.map((c) => [c.slug, c]));
export const toolsIn = (id: CategoryId) => TOOLS.filter((t) => t.category === id);
export const toolPath = (t: Tool) => `/${t.slug}`;
export const categoryPath = (c: Category) => `/${c.slug}`;
export const toolNo = (t: Tool) => String(t.no).padStart(3, '0');
