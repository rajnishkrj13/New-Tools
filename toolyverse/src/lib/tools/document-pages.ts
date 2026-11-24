import type { Tool } from './registry';

/**
 * The document conversion tools: PDF to Word, PDF to Excel and Word to Excel. All run in the
 * browser (pdf.js, Tesseract OCR with Indian-language models, ExcelJS); files are not uploaded.
 */

const UPDATED = '2026-11-24';
const FILES = { publicMb: 25, memberMb: 100 };
const OCR_FEATURE = { key: 'ocr', label: 'OCR for scanned pages', hint: 'Read scanned pages in English and Indian languages', default: true };

const LANG_ROWS: string[][] = [
  ['English, Hindi, Marathi, Nepali, Sanskrit', 'Devanagari / Latin', 'Own OCR model for each'],
  ['Bengali, Assamese', 'Bengali–Assamese', 'Own OCR model for each'],
  ['Gujarati, Punjabi (Gurmukhi), Odia', 'Gujarati, Gurmukhi, Odia', 'Own OCR model for each'],
  ['Tamil, Telugu, Kannada, Malayalam', 'Their own scripts', 'Own OCR model for each'],
  ['Urdu, Sindhi', 'Perso-Arabic (right to left)', 'Own OCR model for each'],
  ['Konkani, Bodo, Dogri, Maithili', 'Devanagari', 'Read with the Marathi or Hindi model (same script)'],
  ['Kashmiri', 'Perso-Arabic or Devanagari', 'Read with the Urdu model (same script)'],
  ['Manipuri (Meitei Mayek), Santali (Ol Chiki)', 'Meitei Mayek, Ol Chiki', 'Text in digital files is kept exactly; no OCR model exists for scans'],
];

export const DOC_TOOLS: Tool[] = [
  {
    slug: 'pdf-to-word',
    category: 'pdf',
    no: 64,
    updated: UPDATED,
    name: 'PDF to Word',
    short: 'Turn a PDF into an editable Word document',
    title: 'Advanced PDF to Word Converter – Convert PDF to Editable DOCX',
    description: 'Convert PDF to editable Word (DOCX) with fonts, real Word tables, pictures, headers and columns kept. Scanned PDFs in English and Indian languages via OCR.',
    h1: 'PDF to Word converter',
    intro:
      'Turn a PDF into a Word document you can edit: paragraphs flow and wrap, headings, bold, colours and links stay, tables become real Word tables with merged cells, pages in two columns stay in two columns, and pictures sit where they were. Scanned PDFs are read with OCR in English and Indian languages. Everything runs in your browser, so the PDF is never uploaded.',
    steps: [
      'Choose one or more PDFs. If one has an open password, type it when asked.',
      'Pick a mode (keep the layout, editable text, OCR every page, or tables and text only) and, for scans, the language or automatic detection.',
      'Compare each page with the converted text, then download the DOCX (or all of them as a ZIP).',
    ],
    sections: [
      {
        h2: 'What the Word file keeps',
        list: [
          'Text you can edit: lines of one paragraph are joined so the text rewraps; headings show in the Navigation Pane.',
          'Formatting: fonts, sizes, bold, italic, underline, colours, links, alignment, indents and spacing.',
          'Tables: bordered and borderless tables become Word tables with merged cells and heading rows that repeat on each page.',
          'Layout: page size and orientation, two-column pages, bullets, and the header and footer repeated on every page (with a live page number).',
          'Pictures: logos, photos and signatures in their place; lines and boxes of the page kept as a picture behind the text in layout mode.',
        ],
      },
      {
        h2: 'Four ways to convert',
        table: {
          head: ['Mode', 'Best for'],
          rows: [
            ['Keep the layout', 'Letters, forms and reports that should look like the PDF'],
            ['Editable text', 'Documents you will rewrite: flowing paragraphs without fixed line positions'],
            ['OCR every page', 'Scans, photos of documents, and PDFs whose Hindi or regional text comes out as wrong letters'],
            ['Tables and text only', 'Reusing the data: text and Word tables without pictures or page decoration'],
          ],
        },
      },
      {
        h2: 'Scanned PDFs and Indian languages',
        body: [
          'Scanned pages are found automatically. Their script is detected and the page is read with the matching OCR model (Hindi, Bengali, Tamil, Telugu, Urdu and the other languages below), together with English for the numbers and English words that appear alongside. Pages scanned sideways are turned upright first. Words the OCR was unsure of are marked yellow in Word for checking. Text is never translated: Hindi stays Hindi, Tamil stays Tamil, and Urdu keeps its right-to-left direction.',
        ],
        table: { head: ['Languages', 'Script', 'Scanned pages'], rows: LANG_ROWS },
      },
      {
        h2: 'Which tool for which job',
        list: [
          'Tables into a spreadsheet: [PDF to Excel](/pdf-to-excel) keeps rows, columns and amounts as Excel values.',
          'Change a few words and keep the PDF as it is: the [PDF Editor](/pdf-editor).',
          'Remove the password first: [Unlock PDF](/unlock-pdf). Pages as pictures: [PDF to JPG](/pdf-to-jpg).',
        ],
      },
    ],
    faqs: [
      { q: 'Is the PDF to Word converter free?', a: 'Yes. No sign-up, no watermark and no limit on conversions. A free account only raises the file size limit.' },
      { q: 'Is my PDF uploaded?', a: 'No. The PDF is read and converted inside your browser and the Word file is made on your device.' },
      { q: 'Are tables kept as tables?', a: 'Yes. Tables with or without borders are found on the page and written as real Word tables, including merged cells and repeated heading rows. Choose "Tables and text only" to get just the text and tables.' },
      { q: 'Can I convert a scanned PDF to Word in Hindi or other Indian languages?', a: 'Yes. Scanned pages are read with OCR in English, Hindi, Bengali, Assamese, Gujarati, Marathi, Punjabi, Odia, Tamil, Telugu, Kannada, Malayalam, Urdu, Sanskrit, Nepali and Sindhi, with the script detected automatically or chosen by you. Uncertain words are marked for checking.' },
      { q: 'Why does my Hindi PDF come out as wrong letters?', a: 'Older PDFs use fonts such as Kruti Dev that store Hindi as Latin letters. The tool recognises them and suggests "OCR every page", which reads the page as an image and gives correct Unicode Hindi.' },
      { q: 'Can I convert many PDFs at once?', a: 'Yes. Add several files; each converts on its own, one failure does not stop the others, and all finished files download together as a ZIP.' },
      { q: 'Will the Word file look exactly like the PDF?', a: 'Close to it in layout mode. Because text becomes normal paragraphs, lines can wrap slightly differently where a font is not installed on your computer.' },
    ],
    featureList: [
      'PDF to editable Word (DOCX)',
      'Real Word tables with merged cells',
      'Fonts, colours, links, underline, alignment and spacing',
      'Two-column pages, bullets, headers and footers',
      'Four modes: layout, editable, OCR, tables',
      'OCR in English and 15 Indian languages with script detection',
      'Batch conversion with ZIP download',
      'Runs in the browser: the PDF is not uploaded',
    ],
    features: [OCR_FEATURE],
    limits: FILES,
    related: ['pdf-to-excel', 'pdf-editor', 'image-to-text', 'unlock-pdf'],
    keywords: ['pdf to word', 'pdf to word converter', 'pdf to docx', 'convert pdf to word', 'pdf to editable word', 'scanned pdf to word', 'hindi pdf to word', 'pdf to word with tables', 'pdf to word without losing formatting', 'tamil pdf to word'],
  },
  {
    slug: 'pdf-to-excel',
    category: 'pdf',
    no: 76,
    updated: UPDATED,
    name: 'PDF to Excel',
    short: 'Extract tables from a PDF into an Excel workbook',
    title: 'PDF to Excel Converter – Extract Tables from PDF to XLSX',
    description: 'Extract tables from PDF to Excel with rows, columns and amounts intact: bank statements, invoices, ledgers, GST reports. Scans in Indian languages. Free, no upload.',
    h1: 'PDF to Excel converter',
    intro:
      'Get the tables out of a PDF and into Excel with every value in its own cell: dates as dates, amounts as numbers, invoice numbers and GSTINs as text. Tables with and without borders are found, tables that run over several pages are joined, and totals and running balances are checked. Compare each table with the PDF side by side, correct anything before downloading, and keep your statements private: nothing is uploaded.',
    steps: [
      'Choose one or more PDFs (bank statements, invoices, ledgers, GST returns, reports).',
      'Review each table next to the PDF: click a cell to see where it came from, fix cells, rows or columns, and rename the sheets.',
      'Download the Excel workbook, with an extraction report of every check made.',
    ],
    sections: [
      {
        h2: 'How the tables are found',
        list: [
          'Ruled tables: the lines the PDF draws give the grid; a missing line between two cells means they are one merged cell.',
          'Tables with only column lines or only row lines: the missing rows or columns come from how the text lines up.',
          'Tables without lines: columns are the strips of white space that run through every row, and a description wrapped onto a second line stays with its row.',
          'Several tables on one page are kept apart, each on its own sheet, in the order they appear.',
          'Tables continued on the next page are joined into one sheet and the repeated heading row is left out (or kept separate if you prefer).',
          'Scanned pages are read with OCR, and the lines of the scan are found in the image to rebuild the grid.',
        ],
      },
      {
        h2: 'Accounts and financial documents',
        body: [
          'Bank statements, vendor and customer ledgers, trial balances, sales and purchase registers, GSTR-1, GSTR-2B and GSTR-3B reports, invoices and outstanding statements are what this tool is built for. Whatever columns the document has are kept; no fixed layout is forced on it. Values are never altered: minus signs, brackets, Dr and Cr, decimals and percentages stay as they were, and identifiers keep their leading zeros instead of turning into 1.23E+15.',
        ],
        table: {
          head: ['In the PDF', 'In Excel'],
          rows: [
            ['1,25,000.50', 'Number 125000.5, shown 1,25,000.50 style'],
            ['(250.00) or 250.00-', 'Number −250, shown in brackets as in the PDF'],
            ['1,250.00 Cr', 'Number 1250 shown as "1,250.00 Cr"'],
            ['05/04/2026, 5-Apr-2026', 'Real Excel date (day first, as in India)'],
            ['18%', 'Number 0.18 shown as 18%'],
            ['27AAPFU0939F1ZV, 000123, INV-007', 'Text, exactly as written'],
          ],
        },
      },
      {
        h2: 'Checks before you download',
        list: [
          'Totals: every total row is compared with the rows above it, and a mismatch is shown with both figures.',
          'Running balances: each balance is checked against the previous one and the row’s debit and credit.',
          'Repeated headings, duplicate rows and text in a column of amounts are pointed out.',
          'Uncertain cells (low OCR certainty or text that crossed a column gap) are shaded yellow, in the preview and in Excel.',
          'Certainty figures for each table, its rows and its columns come from what was measured, not from a guess.',
        ],
        body: ['Nothing is changed to make the figures agree; mismatches are only reported, for you to check against the PDF.'],
      },
      {
        h2: 'Indian languages',
        body: ['Column headings and descriptions in Indian languages are kept exactly as written, and mixed-language tables stay mixed. Tables in Urdu and other right-to-left scripts are written right to left in Excel. Scanned pages are read with these models:'],
        table: { head: ['Languages', 'Script', 'Scanned pages'], rows: LANG_ROWS },
      },
    ],
    faqs: [
      { q: 'Is PDF to Excel free and private?', a: 'Yes. It is free with no sign-up, and the PDF is read in your browser. Bank statements and client documents are never uploaded.' },
      { q: 'Will the columns line up correctly?', a: 'For PDFs with text, columns come from the lines the PDF draws or from the white space between columns, and each value goes into the cell it sits in on the page. Click any cell in the preview to see its place on the PDF; correct cells, rows and columns there before downloading.' },
      { q: 'Can it convert a bank statement that runs over many pages?', a: 'Yes. Pages with the same columns are joined into one sheet and the heading repeated on each page is left out. Running balances are then checked from the first row to the last.' },
      { q: 'Does it work with scanned PDFs?', a: 'Yes. Scanned pages are read with OCR in English or an Indian language, chosen automatically or by you. Check OCR values: they are marked when the reading was uncertain.' },
      { q: 'Are numbers real numbers in Excel?', a: 'Yes, and dates are real dates, so totals and filters work. Invoice numbers, GSTINs, PANs, account numbers and anything with leading zeros stay text. Untick "Numbers and dates as Excel values" to keep every cell as the text shown in the PDF.' },
      { q: 'What if a table is not found?', a: 'Try "Ruled tables only" or "Unruled tables only", or OCR every page for scans. You can also add, delete, merge and split rows, columns and cells in the preview.' },
      { q: 'Can I convert several PDFs at once?', a: 'Yes. Each file is converted on its own and can be reviewed separately; download one workbook or all of them as a ZIP.' },
    ],
    featureList: [
      'Ruled, partly ruled and unruled tables',
      'Merged cells and multi-level headings',
      'Tables joined across pages',
      'Side-by-side check with the PDF',
      'Edit cells, rows, columns and merges',
      'Totals and running balance checks',
      'Numbers, dates and identifiers typed correctly',
      'OCR in English and 15 Indian languages',
      'Batch conversion with ZIP download',
    ],
    features: [OCR_FEATURE],
    limits: FILES,
    related: ['pdf-to-word', 'word-to-excel', 'gstr1-to-excel', 'unlock-pdf'],
    keywords: ['pdf to excel', 'pdf to excel converter', 'convert pdf to excel', 'pdf table to excel', 'bank statement pdf to excel', 'pdf to xlsx', 'scanned pdf to excel', 'invoice pdf to excel', 'ledger pdf to excel', 'gst report pdf to excel'],
  },
  {
    slug: 'word-to-excel',
    category: 'convert',
    no: 77,
    updated: UPDATED,
    name: 'Word to Excel',
    short: 'Tables from a Word document into Excel sheets',
    title: 'Word to Excel Converter – Convert DOCX Tables to XLSX',
    description: 'Convert Word tables to Excel: every table in a DOCX becomes a sheet with merged cells, line breaks, links and numbers kept. Any language. Free and private.',
    h1: 'Word to Excel converter',
    intro:
      'Copying tables from Word into Excel by hand breaks merged cells and turns numbers into text. Here every table in the .docx becomes its own sheet with the same rows, columns and merged cells, numbers and dates become Excel values, and identifiers stay as written. Headings and paragraphs can go on a sheet of their own. Text in Hindi, Tamil, Urdu or any language is kept exactly.',
    steps: ['Choose one or more .docx files.', 'Check the tables: choose which to keep, rename sheets, edit cells, or put tables together.', 'Download the Excel workbook (or all of them as a ZIP).'],
    sections: [
      {
        h2: 'What is kept',
        list: [
          'Every table, in document order, each on its own sheet (or all on one sheet).',
          'Merged cells across columns and down rows, blank cells, and line breaks inside cells.',
          'Heading rows (bold, frozen at the top with filters), links, and numbers and dates as Excel values.',
          'Tables inside tables, extracted as separate sheets and marked where they sat.',
          'Optional: headings, paragraphs and list items outside tables on a "Text" sheet.',
        ],
      },
      {
        h2: 'Supported files',
        body: ['Word 2007 and later (.docx), including files from Google Docs, WPS and LibreOffice saved as .docx. Old .doc files and password-protected documents need to be saved as an unprotected .docx first. To get tables out of a PDF instead, use [PDF to Excel](/pdf-to-excel).'],
      },
    ],
    faqs: [
      { q: 'Is my Word file uploaded?', a: 'No. It is read in your browser and the Excel file is made on your device.' },
      { q: 'Are merged cells kept?', a: 'Yes, both cells merged across columns and cells merged down rows, as Excel merged cells.' },
      { q: 'Does it work with Hindi and other Indian languages?', a: 'Yes. Text is copied exactly as Unicode in any language, and tables in Urdu or other right-to-left scripts are written right to left.' },
      { q: 'Can I combine several tables into one sheet?', a: 'Yes: choose "All tables on one sheet", or use "Add next table below" in the preview to join tables with the same columns.' },
    ],
    featureList: ['Every table to its own sheet', 'Merged cells and nested tables', 'Numbers and dates as Excel values', 'Optional sheet of headings and paragraphs', 'Batch conversion with ZIP download'],
    limits: FILES,
    related: ['pdf-to-excel', 'pdf-to-word', 'case-converter', 'word-counter'],
    keywords: ['word to excel', 'word to excel converter', 'docx to excel', 'convert word table to excel', 'docx to xlsx', 'word table to excel online'],
  },
];
