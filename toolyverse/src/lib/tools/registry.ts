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
}

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
  },
  {
    id: 'gst',
    slug: 'gst-tools',
    name: 'GST tools',
    mark: 'Gs',
    blurb: 'Calculate GST, make invoices, convert GSTR-1 and 3B to Excel and reconcile them.',
    title: 'GST Tools – Calculator, Invoice, GSTR-1/3B to Excel, Reconciliation',
    description: 'Free GST tools: calculator, GSTIN checker, invoice maker, GSTR-1 and GSTR-3B PDF to Excel, GSTR-1 vs 3B reconciliation and GSTR-2B merger. Files stay on your device.',
    intro:
      'Tools for the GST work that comes up every day and at year end: tax on a price, checking a GSTIN, a clean tax invoice, and turning a year of GSTR-1, GSTR-3B and GSTR-2B files into checked, reconciled Excel workbooks. Returns are read in your browser and never uploaded.',
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
    title: 'PDF Editor Online – Edit PDF Text Free, No Watermark',
    description: 'Edit the existing text of a PDF, add text, images and signatures, fill forms, redact and OCR scans. Free online PDF editor that works in your browser.',
    h1: 'Edit a PDF online',
    intro:
      'Click on any line of a PDF and type: the editor keeps the original font where it can and moves the rest of the paragraph along. You can also add text boxes, pictures, highlights, shapes, signatures and form fields, then download a normal PDF.',
    steps: [
      'Open your PDF. It is read in your browser, not uploaded.',
      'Pick Edit Text and click the words you want to change, or use the other tools to add things.',
      'Press Download PDF. Your edits are written into the file.',
    ],
    faqs: [
      { q: 'Can I really change the existing text, not just cover it?', a: 'Yes. The old words are removed from the page and the new ones are written in their place, in the same font when the PDF includes it. If the font is missing a letter, a close match is used.' },
      { q: 'Is my document uploaded anywhere?', a: 'No. The editor runs entirely in your browser. Closing the tab removes it unless you turned on auto-save, which keeps a copy only in your own browser.' },
      { q: 'Does it work with scanned PDFs?', a: 'Yes. Use "Recognise text (OCR)" from the File menu first; the scanned words then become searchable and editable.' },
      { q: 'Is there a watermark on the result?', a: 'No. The downloaded PDF contains only your document and your changes.' },
    ],
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
    related: ['merge-pdf', 'compress-pdf', 'split-pdf', 'protect-pdf'],
    keywords: ['pdf editor', 'edit pdf online', 'edit pdf text', 'pdf editor free', 'sign pdf'],
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
    faqs: [{ q: 'Is the rotation permanent?', a: 'Yes, the saved PDF opens with the pages turned in every PDF reader.' }],
    limits: { publicMb: 25, memberMb: 100 },
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
    faqs: [{ q: 'Which formats can I use?', a: 'JPG, PNG and WebP. HEIC photos from iPhones should be shared as JPG first (iPhone does this when you choose "Most compatible").' }],
    limits: { publicMb: 20, memberMb: 60 },
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
    faqs: [{ q: 'Which resolution should I choose?', a: '150 dpi is right for screens and messages; 300 dpi for printing.' }],
    limits: { publicMb: 25, memberMb: 100 },
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
    faqs: [{ q: 'How do I keep the photo from stretching?', a: 'Leave "Keep proportions" on; changing the width then sets the height for you.' }],
    limits: { publicMb: 15, memberMb: 50 },
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
    faqs: [{ q: 'Does cropping reduce quality?', a: 'No, the kept part is saved at its original resolution.' }],
    limits: { publicMb: 15, memberMb: 50 },
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
    faqs: [{ q: 'What happens to transparency when converting to JPG?', a: 'JPG has no transparency, so transparent areas are filled with the background colour you pick (white by default).' }],
    limits: { publicMb: 15, memberMb: 50 },
    related: ['compress-image', 'resize-image', 'jpg-to-pdf'],
    keywords: ['webp to jpg', 'png to jpg', 'jpg to png', 'image converter'],
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
    title: 'GSTR-3B PDF to Excel – Bulk Convert, ITC and Tax Paid Month-wise',
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
    faqs: [{ q: 'How big is a bigha?', a: 'It differs by state. The converter uses 1,600 square yards (about 0.33 acre), common in Rajasthan and Punjab, and tells you so.' }],
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
    faqs: [{ q: 'What is the largest number it handles?', a: 'Up to 99,99,99,99,99,99,999 in Indian style (99 lakh crore and more) and up to the trillions in international style.' }],
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
    faqs: [{ q: 'How are months counted?', a: 'As calendar months: from 15 January to 15 February is one month, whatever the number of days.' }],
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
    faqs: [{ q: 'Does Title Case keep short words lower-case?', a: 'Yes: a, an, the, and, of, in and similar words stay lower-case unless they start the title.' }],
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
    faqs: [{ q: 'Does it count Hindi words correctly?', a: 'Yes, words are counted by spaces and punctuation in any script, and characters are counted as you see them.' }],
    related: ['case-converter'],
    keywords: ['word counter', 'character counter', 'count words online'],
  },
];

export const toolBySlug = new Map(TOOLS.map((t) => [t.slug, t]));
export const categoryById = new Map(CATEGORIES.map((c) => [c.id, c]));
export const categoryBySlug = new Map(CATEGORIES.map((c) => [c.slug, c]));
export const toolsIn = (id: CategoryId) => TOOLS.filter((t) => t.category === id);
export const toolPath = (t: Tool) => `/${t.slug}`;
export const categoryPath = (c: Category) => `/${c.slug}`;
export const toolNo = (t: Tool) => String(t.no).padStart(3, '0');
