import type { Tool } from './registry';

/**
 * The Tally accounting tools: each a page of its own for its own search, all running on one
 * engine (src/lib/tally) in the browser. Nothing connects to Tally: the tools read and write the
 * Excel and XML files that Tally imports and exports.
 */

const UPDATED = '2026-11-20';
const FILES = { publicMb: 25, memberMb: 100 };

export const TALLY_TOOLS: Tool[] = [
  {
    slug: 'tally-journal-entry-excel',
    category: 'tally',
    no: 65,
    updated: UPDATED,
    name: 'Excel Journal Entry Creator',
    short: 'Type journal vouchers, check them and get Excel or Tally XML',
    title: 'Tally Journal Entry in Excel – Create Vouchers, Get XML',
    description: 'Create Tally journal entries in an Excel-style editor: many debit and credit lines, cost centres and bill references. Check, then download Excel or Tally XML.',
    h1: 'Create Tally journal entries in Excel format',
    intro:
      'Write journal vouchers the way you would in a spreadsheet: as many vouchers and ledger lines as you need, debits and credits, narration, references, cost centres and bill-wise details. Each voucher is checked as you type, then saved as an Excel file or as Tally XML ready to import. Your entries stay in this browser.',
    steps: [
      'Add a voucher, or start from one of more than 100 ready entries (rent, GST, TDS, payroll, depreciation and more), or upload your Excel sheet.',
      'Fill in the ledger names exactly as in Tally, with the debit and credit amounts. Use "Balance it" to put the difference on the last line.',
      'Fix anything the check flags, then download Tally XML (or Excel) and import it in Tally: Gateway of Tally → Import → Transactions.',
    ],
    sections: [
      {
        h2: 'The Excel template, column by column',
        body: ['One row is one ledger line; a voucher takes as many rows as it has lines. Download the template from the tool, or use these headers in your own sheet:'],
        table: {
          head: ['Column', 'Header', 'What goes in it'],
          rows: [
            ['A', 'Voucher Date', 'DD-MM-YYYY; on the first row of each voucher is enough'],
            ['B', 'Voucher Type', 'Journal, Payment, Receipt, Contra, Sales, Purchase, Debit Note, Credit Note, or your own type'],
            ['C', 'Voucher Number', 'The same on every row of one voucher'],
            ['D', 'Reference Number', "Supplier's bill number, cheque number, any reference"],
            ['E', 'Reference Date', 'Date of that reference'],
            ['F', 'Ledger Name', 'Exactly as named in Tally'],
            ['G', 'Debit Amount', 'Debit lines only'],
            ['H', 'Credit Amount', 'Credit lines only'],
            ['I', 'Voucher Narration', 'Once per voucher'],
            ['J', 'Cost Centre', 'A name, or a split such as "Head Office: 6000; Branch: 4000"'],
            ['K', 'Cost Category', 'Blank uses Primary Cost Category'],
            ['L', 'Bill-wise Reference', '"INV-101", "Agst Ref INV-101", "New Ref INV-9: 5000; Agst Ref INV-3: 2000"'],
          ],
        },
      },
      {
        h2: 'What is checked before the XML is made',
        list: [
          'Balance: total debits equal total credits in every voucher, with the difference shown.',
          'Completeness: date, voucher type, ledger names and an amount on every line; one side per line; no negative amounts.',
          'Allocations: cost centre splits and bill references add up to their line.',
          'Duplicates: the same voucher number used twice for one voucher type.',
          'GST lines: CGST and SGST that do not match, input tax on sales or output tax on purchases.',
        ],
      },
      {
        h2: 'Several voucher types in one file',
        body: [
          'Journal is the default, but each voucher keeps its own type: a payment goes in as a Payment voucher, a bank transfer as Contra, a sale as Sales. The XML follows Tally’s rules for each, including the party ledger on sales, purchases and notes. Download one XML file for everything, or one file per voucher type. To match the columns of your own spreadsheet instead of the template, use the [Excel to Tally XML Converter](/excel-to-tally-xml-converter).',
        ],
      },
    ],
    faqs: [
      { q: 'Do my ledger names have to match Tally exactly?', a: 'Yes. Tally refuses a voucher whose ledger does not exist. Use the same spelling and spaces as in Tally; capital letters do not matter. You can load your ledger names from a Tally export (List of Accounts as XML) so they are suggested as you type, and the tool can make an XML of new ledgers to import first.' },
      { q: 'Is my data uploaded?', a: 'No. Vouchers are written and checked in your browser and kept there as a draft. Templates you save go to your account only if you are signed in.' },
      { q: 'Can I enter cost centres and bill-wise details?', a: 'Yes. Put a cost centre (or a split across several) and a bill reference on any line. The ledger must have cost centres or bill-wise details switched on in Tally for them to be kept.' },
      { q: 'Which Tally versions can import the XML?', a: 'TallyPrime (all releases) and Tally.ERP 9. Choose Tally.ERP 9 under Tally version for older installations; it leaves out tags only TallyPrime uses.' },
      { q: 'Is this accounting advice?', a: 'No. The templates are common examples. Check each entry against the facts and your accounting policies, or with your accountant.' },
    ],
    featureList: ['Unlimited vouchers and ledger lines', 'Debit and credit check per voucher', 'Cost centres, cost categories and bill-wise references', 'More than 100 entry templates and your own saved templates', 'Excel template download and upload', 'Tally XML for TallyPrime and Tally.ERP 9'],
    features: [{ key: 'templates', label: 'Saved templates', hint: 'Lets visitors save their own entry templates', default: true }],
    limits: { publicMb: 10, memberMb: 50 },
    related: ['tally-journal-entry-templates', 'excel-to-tally-xml-converter', 'tally-xml-validator', 'tally-xml-import'],
    keywords: ['tally journal entry excel', 'journal entry in excel for tally', 'tally journal voucher excel format', 'excel journal entry template tally', 'create journal voucher tally xml', 'bulk journal entry tally'],
  },
  {
    slug: 'excel-to-tally-xml-converter',
    category: 'tally',
    no: 66,
    updated: UPDATED,
    name: 'Excel to Tally XML Converter',
    short: 'Turn any Excel or CSV of entries into Tally import XML',
    title: 'Excel to Tally XML Converter – Free, All Voucher Types',
    description: 'Convert Excel, XLS or CSV entries to Tally XML: match your columns, group rows into vouchers, check debit and credit, and download XML for TallyPrime or ERP 9.',
    h1: 'Excel to Tally XML converter',
    intro:
      'Bring entries from any spreadsheet into Tally. Upload an XLSX, XLS or CSV file, tell the tool which column is which (it guesses most of them), and it groups the rows into vouchers, checks that each one balances, and writes the XML Tally imports. Journal, payment, receipt, contra, sales, purchase, debit note and credit note vouchers are all supported.',
    steps: ['Choose your Excel or CSV file and the worksheet.', 'Check the column matching: date, voucher type, number, ledger, debit and credit (or one amount column with Dr/Cr).', 'Review the vouchers and problems, then download one XML file, one per voucher type, or one per voucher.'],
    sections: [
      {
        h2: 'What is Excel to Tally XML?',
        body: [
          'Tally cannot read an Excel file directly, but it imports XML: a text file in which every voucher, ledger line and amount is marked with tags Tally knows. Converting the sheet to that format is how bank statements, payroll sheets, sales from other software or a month of journal entries get into Tally without typing them again.',
        ],
      },
      {
        h2: 'Preparing the sheet',
        list: [
          'One row per ledger line: a voucher with three lines takes three rows.',
          'Voucher details on the first row: date, type and number may be left blank on the rows below; they carry down.',
          'No voucher numbers? Rows are grouped until debits equal credits, then a new voucher starts.',
          'Amounts: separate Debit and Credit columns, or one Amount column with a Dr/Cr column (without it, minus amounts are credits).',
          'Dates in any common form: 01-04-2026, 1/4/26, 1-Apr-2026 or real Excel dates.',
        ],
      },
      {
        h2: 'Importing the XML into Tally',
        body: [
          'Back up the company first. In TallyPrime go to Gateway of Tally → Import → Transactions (Tally.ERP 9: Import of Data → Vouchers), give the file path and press Enter. Tally reports how many vouchers it created; refused ones are listed in Tally.imp with the reason. To check a file before importing, use the [Tally XML Validator](/tally-xml-validator).',
        ],
      },
      {
        h2: 'Common import errors and their fixes',
        table: {
          head: ['Tally says', 'Usual cause', 'Fix'],
          rows: [
            ["Ledger 'X' does not exist", 'The name differs from Tally, or the ledger is new', 'Correct the name, or import a ledgers XML first'],
            ['Voucher totals do not match', 'Debits and credits differ', 'Fix the amounts; the converter shows the difference'],
            ['Voucher type does not exist', 'A custom type name spelt differently', 'Use the exact type name from Tally'],
            ['Date out of range', 'The date is before the books begin or in another financial year', 'Change the date or the period in Tally'],
          ],
        },
      },
    ],
    faqs: [
      { q: 'Which file types can I convert?', a: 'XLSX, XLS and CSV spreadsheets, and XML from other software (use the [XML to Tally Converter](/xml-to-tally-converter) page for that). The file is read by what it really contains, not just its name.' },
      { q: 'Can one file hold different voucher types?', a: 'Yes. Put the type in a Voucher Type column; rows without a type use the default you choose. You can download one XML for all of them or one file per type.' },
      { q: 'What happens to vouchers with errors?', a: 'They are left out of the XML and listed with the reason, so a bad row never reaches Tally. The Excel download keeps everything with the checks beside it.' },
      { q: 'Does it support GST, TDS, cost centres and bills?', a: 'GST and TDS are ledger lines like any other, and the tool warns when CGST and SGST do not match. Cost centres and bill-wise references come from their own columns.' },
      { q: 'Is the spreadsheet uploaded?', a: 'No. It is read and converted in your browser; nothing is sent to a server.' },
    ],
    featureList: ['XLSX, XLS and CSV', 'Worksheet and header row choice', 'Automatic and manual column matching', 'Vouchers grouped by number or by balance', 'Eight Tally voucher types', 'One XML, one per type or one per voucher'],
    limits: FILES,
    related: ['tally-journal-entry-excel', 'tally-xml-validator', 'tally-xml-import', 'tally-xml-to-excel-converter'],
    keywords: ['excel to tally xml converter', 'excel to tally', 'convert excel to tally xml', 'csv to tally xml', 'import excel data into tally', 'excel to tally prime'],
  },
  {
    slug: 'tally-xml-to-excel-converter',
    category: 'tally',
    no: 67,
    updated: UPDATED,
    name: 'Tally XML to Excel Converter',
    short: 'Open Tally XML exports as clean Excel sheets',
    title: 'Tally XML to Excel Converter – Vouchers, Ledgers, Reports',
    description: 'Convert Tally XML to Excel: vouchers with every ledger line, bill-wise, cost centres, bank and stock details, plus ledger masters and reports, each on its own sheet.',
    h1: 'Tally XML to Excel converter',
    intro:
      'Tally exports data as XML, which is hard to read and impossible to sort. Open the file here and get an Excel workbook: one row per ledger line with the voucher date, type, number, references and narration, and separate sheets for bill-wise details, cost centres, bank details, stock lines and anything else the file holds. Nothing is dropped without a note saying so.',
    steps: ['Export from Tally as XML (for example the Day Book with Alt+E → XML).', 'Choose the file here and look over what it holds.', 'Download the Excel workbook.'],
    sections: [
      {
        h2: 'What each sheet holds',
        table: {
          head: ['Sheet', 'Contents'],
          rows: [
            ['Vouchers', 'One row per ledger line in the same 12-column layout as the import template, plus the party ledger'],
            ['Voucher summary', 'One row per voucher with its totals and any difference'],
            ['Bill-wise', 'Bill type, bill name and amount for each bill allocation'],
            ['Cost centres', 'Cost category, cost centre and amount'],
            ['Bank details', 'Transaction type, instrument number and date, and other bank fields'],
            ['Stock lines', 'Item, quantity, rate and amount of invoice vouchers'],
            ['Other fields', 'Every other value in the vouchers (GUID, GST fields and so on), one row per value'],
            ['Ledgers, Groups…', 'Masters, when the file has them'],
            ['Report', 'Trial Balance, Balance Sheet or other report rows'],
            ['Not converted', 'Nested parts of the XML that have no column, with how often they appear'],
          ],
        },
      },
      {
        h2: 'Exporting XML from Tally',
        body: [
          'In TallyPrime open the report you want (Day Book, a voucher register, a ledger, List of Accounts or Trial Balance), press Alt+E, choose Format: XML (Data Interchange) and export. Tally.ERP 9 works the same with Alt+E. The [Tally XML Export](/tally-xml-export) page lists where each kind of data is.',
        ],
      },
      {
        h2: 'Round trip: back into Tally',
        body: [
          'The Vouchers sheet uses the same columns as the import template. Edit it, then turn it back into Tally XML with the [Excel to Tally XML Converter](/excel-to-tally-xml-converter), for example to move entries to another company after correcting ledger names.',
        ],
      },
    ],
    faqs: [
      { q: 'Are amounts kept exactly?', a: 'Yes. Debit and credit come from Tally’s own sign convention and are kept to the paisa; each voucher’s total is shown on the summary sheet.' },
      { q: 'Can it read sales invoices with stock items?', a: 'Yes. The sales or purchase ledger amounts inside each stock line become ledger lines, and the items themselves go to the Stock lines sheet.' },
      { q: 'What if my file has fields the tool does not know?', a: 'Single values go to the Other fields sheet; nested sections are listed on Not converted with how often they appear. Nothing disappears silently.' },
      { q: 'Does it work with Tally.ERP 9 files?', a: 'Yes, and with UTF-16 encoded files, which Tally sometimes writes.' },
    ],
    featureList: ['Vouchers, masters and reports', 'Bill-wise, cost centre, bank and stock sheets', 'Every unmapped field reported', 'TallyPrime and Tally.ERP 9 exports', 'Runs in the browser'],
    limits: FILES,
    related: ['tally-xml-export', 'excel-to-tally-xml-converter', 'tally-xml-validator', 'tally-voucher-export'],
    keywords: ['tally xml to excel', 'convert tally xml to excel', 'tally xml to excel converter', 'tally day book to excel', 'tally data to excel', 'tally export to excel'],
  },
  {
    slug: 'tally-xml-import',
    category: 'tally',
    no: 68,
    updated: UPDATED,
    name: 'XML to Tally Import',
    short: 'Check an XML file and prepare it for import into Tally',
    title: 'Tally XML Import – Check, Fix and Import Vouchers',
    description: 'Prepare XML for import into TallyPrime: find errors, missing ledgers and duplicates, pick vouchers and download a clean file. Step-by-step import guide.',
    h1: 'Import XML into Tally without errors',
    intro:
      'Most failed imports come from a handful of problems: a ledger name Tally does not know, vouchers that do not balance, or entries that are already in the books. Check the file here first, compare it with an export of your Tally data, tick the vouchers you want, and download a clean file that imports first time.',
    steps: ['Choose the Tally XML (or the voucher Excel template).', 'Optionally add an XML export of your Tally ledgers or Day Book, to find missing ledgers and vouchers already entered.', 'Tick the vouchers, download the import file and import it in Tally.'],
    sections: [
      {
        h2: 'How to import XML into TallyPrime',
        list: [
          'Back up the company: Alt+Y (Data) → Backup.',
          'If new ledgers are needed, import their XML first: Gateway of Tally → Import → Masters.',
          'Import the vouchers: Gateway of Tally → Import → Transactions, enter the file path, press Enter.',
          'Tally.ERP 9: Gateway of Tally → Import of Data → Vouchers.',
          'Read the result screen: vouchers created, and errors written to Tally.imp in the Tally folder.',
        ],
      },
      {
        h2: 'Finding missing ledgers before Tally does',
        body: [
          "Export List of Accounts from your Tally as XML (Alt+E) and add it as the comparison file. Every ledger the vouchers use but Tally does not have is listed; choose a group for each and download a ledgers XML to import first, or correct the spelling in the source. The same comparison with a Day Book export flags vouchers already in Tally with the same type, number and date, and leaves them out.",
        ],
      },
      {
        h2: 'Importing bulk vouchers',
        body: [
          'Thousands of vouchers import in one go. Errors are found per voucher, so one bad entry does not stop the rest: it is shaded, cannot be ticked, and appears in the downloadable error report with the reason. Vouchers from a Tally export are passed on exactly as they were, without Tally’s internal IDs, so they are created as new entries instead of overwriting existing ones.',
        ],
      },
    ],
    faqs: [
      { q: 'Does this tool connect to my Tally?', a: 'No. It prepares and checks the file; you import it in Tally yourself, which keeps your books entirely under your control.' },
      { q: "Why does Tally say a ledger does not exist?", a: 'The voucher uses a ledger name Tally cannot find: a different spelling, an extra space, or a ledger that was never created. Compare with your List of Accounts export here to see every such name at once.' },
      { q: 'How do I avoid entering vouchers twice?', a: 'Add a Day Book export covering the same dates. Vouchers with the same type, number and date are marked as already in Tally and are not included in the download.' },
      { q: 'Can I import only some vouchers?', a: 'Yes. Untick the ones you do not want; the download holds only the ticked, error-free vouchers.' },
      { q: 'Can I use Excel instead of XML?', a: 'Yes, if it follows the voucher template. For other layouts use the [Excel to Tally XML Converter](/excel-to-tally-xml-converter).' },
    ],
    featureList: ['XML syntax and structure checks', 'Debit/credit, date and ledger checks', 'Missing ledgers and duplicates from a Tally export', 'Choose vouchers to import', 'Clean import file and error report', 'Ledger masters XML for new ledgers'],
    limits: FILES,
    related: ['tally-xml-validator', 'tally-xml-converter', 'excel-to-tally-xml-converter', 'tally-voucher-import'],
    keywords: ['tally xml import', 'import xml into tally', 'import xml in tally prime', 'tally import error', 'import bulk vouchers tally', 'tally xml import format'],
  },
  {
    slug: 'tally-xml-export',
    category: 'tally',
    no: 69,
    updated: UPDATED,
    name: 'Tally to XML Export',
    short: 'Export XML from Tally, then filter, pick and convert it',
    title: 'Tally XML Export – How to Export, Filter and Convert',
    description: 'Export vouchers, ledgers and reports from TallyPrime or ERP 9 as XML, then filter by type, date or ledger, pick vouchers and download clean XML or Excel.',
    h1: 'Export XML from Tally',
    intro:
      'Tally exports any report as XML with Alt+E. This page shows where each kind of data is, then takes the exported file further: filter vouchers by type, financial year, number or ledger, pick the ones you need, and save them as a smaller XML (ready for another company if you like) or as Excel.',
    steps: ['Export the report from Tally: Alt+E → Format: XML (Data Interchange).', 'Open the file here and filter by voucher type, dates, number or ledger.', 'Download the chosen vouchers as XML or Excel.'],
    sections: [
      {
        h2: 'Where to export each kind of data',
        table: {
          head: ['Data', 'TallyPrime'],
          rows: [
            ['All vouchers', 'Day Book → F2 for the period → Alt+E → XML'],
            ['Journal, payment, sales… vouchers', 'Account Books → the voucher register → Alt+E'],
            ['Vouchers of one ledger', 'Account Books → Ledger → choose it → Alt+E'],
            ['Ledgers and groups', 'List of Accounts → Alt+E'],
            ['Stock items, cost centres', 'List of Accounts → change view → Alt+E'],
            ['Trial Balance, Balance Sheet, P&L', 'Open the report → Alt+E'],
            ['Outstanding bills', 'Statements of Accounts → Outstandings → Alt+E'],
          ],
        },
      },
      {
        h2: 'Exporting voucher data and ledger data',
        body: [
          'For vouchers, the Day Book export holds complete vouchers with every ledger line, bill and cost centre allocation, ready to be imported again. For ledger data, export List of Accounts: it gives every ledger with its group, opening balance and settings. Both open here and in the [Tally XML to Excel Converter](/tally-xml-to-excel-converter).',
        ],
      },
      {
        h2: 'Moving vouchers to another company',
        body: [
          'Tick "Prepare for importing into another company" before downloading: Tally’s internal IDs are removed so the entries are created as new ones rather than matched with the originals. To rename ledgers on the way, use the [Tally XML Converter](/tally-xml-converter).',
        ],
      },
    ],
    faqs: [
      { q: 'Does this page connect to Tally?', a: 'No. Tally writes the XML file itself; this page reads that file in your browser.' },
      { q: 'Why is my export so large?', a: 'Tally writes every field, including many empty tags. Filtering to the vouchers you need and removing empty tags makes the file much smaller.' },
      { q: 'Can I export only one voucher type?', a: 'Export the Day Book for the period and filter by type here, or export that voucher register from Tally directly.' },
      { q: 'How do I convert the exported XML into Excel?', a: 'Choose Download Excel here, or use the [Tally XML to Excel Converter](/tally-xml-to-excel-converter) for the whole file.' },
    ],
    featureList: ['Export steps for TallyPrime and Tally.ERP 9', 'Filter by voucher type, financial year, dates, number and ledger', 'Pick vouchers one by one', 'XML ready for another company', 'Excel download'],
    limits: FILES,
    related: ['tally-xml-to-excel-converter', 'tally-voucher-export', 'tally-xml-converter', 'tally-xml-import'],
    keywords: ['tally xml export', 'export xml from tally', 'tally export to xml', 'tally prime export xml', 'export ledger from tally', 'export vouchers from tally'],
  },
  {
    slug: 'tally-xml-converter',
    category: 'tally',
    no: 70,
    updated: UPDATED,
    name: 'Tally XML to XML Converter',
    short: 'Rename ledgers, change company or version in Tally XML',
    title: 'Tally XML Converter – Rename Ledgers, Change Company',
    description: 'Convert Tally XML to Tally XML: rename ledgers and voucher types, change the company, remove IDs, filter vouchers and switch between TallyPrime and ERP 9 format.',
    h1: 'Tally XML to XML converter',
    intro:
      'Move vouchers between companies whose ledgers have different names, turn an export into a clean import file, or prepare a TallyPrime file for Tally.ERP 9. The vouchers themselves are carried over element by element, so stock lines, GST details and every other field stay as they were; only the changes you choose are made, and each one is counted.',
    steps: ['Choose the Tally XML file.', 'Pick the target version and company, which vouchers to keep, and any ledger or voucher type renames.', 'Convert, compare source and result side by side, and download.'],
    sections: [
      {
        h2: 'What it can change',
        list: [
          'Ledger names: everywhere they appear, including party ledgers and the ledger masters.',
          'Voucher type names: for a company that calls Journal "JV" or Sales "Sales GST".',
          "Company: the company the file imports into.",
          "Tally's internal IDs: GUID, REMOTEID and ALTERID removed so entries import as new.",
          'Empty tags: removed for a smaller file.',
          'Version: ledger-line tags and view tags written the TallyPrime or Tally.ERP 9 way for accounting vouchers.',
          'Selection: only some voucher types, or a date range.',
        ],
      },
      {
        h2: 'Masters and vouchers',
        body: [
          'When a file holds both, the masters are written to a separate file to import first, so the ledgers exist when the vouchers arrive. To check the converted file before importing, open it in the [Tally XML Validator](/tally-xml-validator).',
        ],
      },
    ],
    faqs: [
      { q: 'Will anything in the vouchers be lost?', a: 'No. The tool copies each voucher as it is and changes only what you ask for; the result screen lists every change and how many times it was made.' },
      { q: 'Why remove the IDs?', a: 'Tally uses GUID and REMOTEID to recognise an entry. Left in, an import into the same company can alter the existing voucher instead of creating a new one, and an import into another company may be refused.' },
      { q: 'Can it convert XML from other software?', a: 'Not this page: it changes Tally XML. For XML from other software, use the [XML to Tally Converter](/xml-to-tally-converter).' },
    ],
    featureList: ['Rename ledgers and voucher types', 'Change the company', 'Remove Tally IDs and empty tags', 'Filter by voucher type and dates', 'TallyPrime or Tally.ERP 9 format', 'Source and result preview'],
    limits: FILES,
    related: ['xml-to-tally-converter', 'tally-xml-validator', 'tally-xml-import', 'tally-xml-export'],
    keywords: ['tally xml converter', 'convert tally xml', 'tally xml to xml', 'rename ledger in tally xml', 'tally erp 9 to tally prime xml', 'change company in tally xml'],
  },
  {
    slug: 'tally-journal-entry-templates',
    category: 'tally',
    no: 71,
    updated: UPDATED,
    name: 'Journal Entry Templates',
    short: 'More than 100 ready accounting entries for Tally',
    title: 'Tally Journal Entry Templates – 100+ Accounting Entries',
    description: 'Ready journal entry templates for Tally: GST, TDS, payroll, depreciation, provisions, bank and intercompany entries. Set an amount, edit, download XML or Excel.',
    h1: 'Journal entry templates for Tally',
    intro:
      'More than a hundred common accounting entries, grouped the way accountants think about them: adjustments and provisions, GST and TDS, banking, payroll, fixed assets, day-to-day expenses and intercompany entries. Enter one amount and each line is worked out; change the ledger names to yours, then open the entries in the Journal Entry Creator or download them for Tally. Save your own entries as templates too.',
    steps: ['Search or choose a category and set the base amount.', 'Open a template to see its lines, or tick several.', 'Use them in the Journal Entry Creator, or download as Excel or Tally XML.'],
    sections: [
      {
        h2: 'What the templates cover',
        table: {
          head: ['Category', 'Examples'],
          rows: [
            ['General accounting', 'Adjustment, opening balance, closing, rectification, reversal, provisions, accruals, prepaid, income received in advance, depreciation, bad debts, round-off'],
            ['GST and taxes', 'Input and output CGST, SGST, IGST, set-off, reverse charge, GST payable, credit and debit notes, TDS and TCS, GST interest and late fee'],
            ['Banking and finance', 'Bank charges, interest, loans, EMI split, cheque dishonour, exchange gain or loss, payment gateway and card charges, contra entries'],
            ['Payroll', 'Salary provision with PF, ESI, PT and TDS, advances, gratuity, bonus, reimbursement, leave encashment'],
            ['Fixed assets', 'Purchase, capitalisation, CWIP, depreciation, disposal at profit or loss, write-off'],
            ['Business operations', 'Rent, electricity, telephone, insurance, advertising, royalty, subscriptions, manpower, stock shortage or excess'],
            ['Intercompany and branches', 'Receivable and payable, related parties, head office and branch, cost allocation, balance transfer'],
          ],
        },
      },
      {
        h2: 'How amounts work',
        body: [
          'Each line is a share of one base amount: a purchase with 18% GST has Purchase at 100, CGST and SGST at 9 each and the supplier at 118. Type 50,000 and the lines become 50,000, 4,500, 4,500 and 59,000. Rounding is settled so every entry balances. Entries with two independent amounts, such as an EMI split, start with a typical split that you change in the [Excel Journal Entry Creator](/tally-journal-entry-excel).',
        ],
      },
      {
        h2: 'Not advice',
        body: ['These are widely used examples to save typing. The right entry depends on the transaction, the law and your accounting policies, so review each one, or ask your accountant, before posting it.'],
      },
    ],
    faqs: [
      { q: 'Can I change the ledger names?', a: 'Yes, always. Ledger names in templates are suggestions; change them in the Journal Entry Creator, or copy a template and save it with your own names.' },
      { q: 'Can I save my own templates?', a: 'Yes. Create one from scratch here, or save any voucher in the Journal Entry Creator as a template. They are kept in this browser, and on your account when you are signed in.' },
      { q: 'Is stock adjustment a journal entry in Tally?', a: 'The value side can be, as the template shows; quantities are adjusted with a Physical Stock or Stock Journal voucher in Tally, which these templates do not create.' },
    ],
    featureList: ['102 built-in entries in 7 categories', 'Amounts from one base figure, always balanced', 'Your own templates, saved', 'Open in the Journal Entry Creator', 'Excel and Tally XML download'],
    related: ['tally-journal-entry-excel', 'excel-to-tally-xml-converter', 'gst-calculator', 'tally-xml-import'],
    keywords: ['tally journal entry templates', 'journal entries in tally with examples', 'gst journal entry in tally', 'tds journal entry tally', 'salary provision entry tally', 'depreciation entry in tally'],
  },
  {
    slug: 'tally-xml-validator',
    category: 'tally',
    no: 72,
    updated: UPDATED,
    name: 'Tally XML Validator',
    short: 'Find errors in a Tally XML file before importing it',
    title: 'Tally XML Validator – Check XML Before Import',
    description: 'Validate Tally XML before import: syntax, required tags, dates, voucher types, ledger names, debit and credit, allocations, duplicates. Line-by-line Excel report.',
    h1: 'Tally XML validator',
    intro:
      'Find out what Tally will refuse before you import. The validator reads the file line by line and reports broken XML, missing tags, vouchers that do not balance, bad dates and amounts, allocations that do not add up and duplicate numbers, each with its line number. Add an export of your Tally data to also catch ledgers that do not exist and vouchers already entered.',
    steps: ['Choose the XML file.', 'Read the problems, sorted into errors and warnings, with line numbers.', 'Download the report, fix the file, and check it again.'],
    sections: [
      {
        h2: 'Checks it runs',
        table: {
          head: ['Check', 'Example of a problem found'],
          rows: [
            ['XML syntax', 'A tag that is never closed, text outside the envelope'],
            ['Structure', 'No REPORTNAME, vouchers outside TALLYMESSAGE'],
            ['Dates', 'A date that is not YYYYMMDD, or 31 February'],
            ['Voucher type and number', 'Missing type, VCHTYPE and VOUCHERTYPENAME that differ, a number used twice'],
            ['Ledger lines', 'No ledger name, an amount like 1,000 that Tally cannot read, sign and ISDEEMEDPOSITIVE that disagree'],
            ['Balance', 'Debits and credits that differ, with the difference'],
            ['Allocations', 'Cost centres or bills that do not add up to their line'],
            ['GST', 'CGST and SGST that differ, input tax on a sale'],
            ['Against your Tally (optional)', 'Ledgers and voucher types that do not exist, vouchers already entered'],
          ],
        },
      },
      {
        h2: 'Errors and warnings',
        body: [
          'An error is something Tally will refuse or get wrong, such as an unbalanced voucher. A warning is worth a look but may be fine, such as a custom voucher type or a tag this validator does not check. Fix errors with the [Tally XML Converter](/tally-xml-converter) or in the source sheet, then validate again.',
        ],
      },
    ],
    faqs: [
      { q: 'Is the file safe to check here?', a: 'Yes. It is read in your browser and never uploaded, and the reader ignores DOCTYPE and entity declarations, so a malicious XML file cannot make it fetch anything.' },
      { q: 'Can it check that ledgers exist?', a: 'Yes, with an XML export of List of Accounts from your Tally. Without one it checks everything else.' },
      { q: 'Does a clean report guarantee the import?', a: 'It removes the common causes of failure. Tally can still refuse an entry for reasons only it knows, such as a period that is locked or a ledger without bill-wise details.' },
    ],
    featureList: ['Syntax errors with line numbers', 'Envelope and voucher structure', 'Dates, types, numbers and amounts', 'Debit and credit balance', 'Cost centre and bill allocations', 'Duplicates and missing ledgers', 'Excel report'],
    limits: FILES,
    related: ['tally-xml-import', 'tally-xml-converter', 'excel-to-tally-xml-converter', 'tally-xml-to-excel-converter'],
    keywords: ['tally xml validator', 'validate tally xml', 'check tally xml file', 'tally xml error', 'tally import xml error checker', 'tally xml format check'],
  },
];

/** Pages for searches that are best served by one of the tools above, opened with a setting. */
export const TALLY_PAGES: Tool[] = [
  {
    slug: 'xml-to-tally-converter',
    category: 'tally',
    no: 73,
    updated: UPDATED,
    opens: 'excel-to-tally-xml-converter',
    preset: { source: 'xml' },
    name: 'XML to Tally Converter',
    short: 'Turn XML from other software into Tally vouchers',
    title: 'XML to Tally Converter – Other Software XML into Tally',
    description: 'Convert XML from billing, banking or other accounting software into Tally import XML. Match the fields to voucher columns, check balances and download for Tally.',
    h1: 'XML to Tally converter',
    intro:
      'Billing software, bank portals and other accounting programs often export XML that Tally cannot read. Upload it here: the repeating records become rows, you match their fields to date, ledger, debit and credit, and the tool writes vouchers in the XML Tally imports, checked and balanced.',
    steps: ['Choose the XML file from the other software.', 'Match its fields to the voucher columns (most are found automatically).', 'Check the vouchers and download Tally XML.'],
    sections: [
      {
        h2: 'How the XML is read',
        body: [
          'The tool looks for the element that repeats most, such as <Transaction> or <Entry>, and treats each one as a row; its child values and attributes become the columns. You then match those columns as you would in a spreadsheet, and rows are grouped into vouchers by number, or by balance when there are no numbers.',
        ],
      },
      {
        h2: 'Already Tally XML?',
        body: [
          'If the file comes from Tally, the tool says so and points to the right page: the [Tally XML Converter](/tally-xml-converter) to change ledger names or the company, or the [Tally XML Validator](/tally-xml-validator) to check it.',
        ],
      },
    ],
    faqs: [
      { q: 'Which XML files work?', a: 'Any XML with one record per entry and the values as child elements or attributes: exports from billing software, e-commerce settlements, bank statements in XML and similar.' },
      { q: 'What if the records hold one amount with a Dr/Cr flag?', a: 'Match the amount to Amount and the flag to Dr / Cr. Without a flag, minus amounts are taken as credits.' },
      { q: 'Is the file uploaded?', a: 'No. It is read in your browser.' },
    ],
    featureList: ['Any XML with repeating records', 'Field matching to voucher columns', 'Balance and ledger checks', 'Tally XML for TallyPrime and Tally.ERP 9'],
    limits: FILES,
    related: ['excel-to-tally-xml-converter', 'tally-xml-converter', 'tally-xml-validator', 'tally-xml-import'],
    keywords: ['xml to tally converter', 'convert xml to tally', 'xml to tally', 'import xml from other software into tally', 'xml to tally prime'],
  },
  {
    slug: 'tally-voucher-import',
    category: 'tally',
    no: 74,
    updated: UPDATED,
    opens: 'tally-xml-import',
    preset: { accept: 'excel' },
    name: 'Tally Voucher Import',
    short: 'Import many vouchers into Tally from Excel or XML',
    title: 'Tally Voucher Import – Bulk Vouchers from Excel or XML',
    description: 'Import vouchers into Tally in bulk from the Excel template or XML: payment, receipt, sales, purchase, journal and notes, checked and deduplicated.',
    h1: 'Import vouchers into Tally in bulk',
    intro:
      'Entering a month of payments, receipts or sales one by one takes hours. Fill them into the voucher template (or bring an XML file), check them here, leave out any already in Tally, and import the lot in one step from Gateway of Tally.',
    steps: ['Fill the voucher Excel template, or choose an XML file.', 'Check the vouchers; add a Day Book export to skip ones already entered.', 'Download the import file and import it in Tally.'],
    sections: [
      {
        h2: 'Voucher types you can import',
        table: {
          head: ['Type', 'Typical use', 'Lines'],
          rows: [
            ['Payment', 'Expenses and supplier payments from bank or cash', 'Expense or party Dr, bank Cr'],
            ['Receipt', 'Customer receipts, interest received', 'Bank Dr, customer or income Cr'],
            ['Contra', 'Cash deposits, withdrawals, transfers between banks', 'Bank or cash on both sides'],
            ['Sales / Purchase', 'Invoices without stock items', 'Party, sales or purchase ledger, GST'],
            ['Debit / Credit Note', 'Returns and price changes', 'Reverse of the sale or purchase'],
            ['Journal', 'Adjustments, provisions, depreciation', 'Any ledgers'],
          ],
        },
      },
      {
        h2: 'Before you import',
        list: [
          'Back up the company.',
          'Make sure every ledger exists: compare with a List of Accounts export, or import the ledgers XML the tool makes.',
          'Check the voucher type names: custom types such as "Sales GST" must match Tally exactly.',
          'Start with a few vouchers and check them in the Day Book before importing the rest.',
        ],
      },
      {
        h2: 'Writing the vouchers',
        body: [
          'Type them in the [Excel Journal Entry Creator](/tally-journal-entry-excel), start from [Journal Entry Templates](/tally-journal-entry-templates), or bring your own spreadsheet through the [Excel to Tally XML Converter](/excel-to-tally-xml-converter).',
        ],
      },
    ],
    faqs: [
      { q: 'How many vouchers can I import at once?', a: 'Thousands. Tally imports them in one go; the checks here run on the whole file in your browser.' },
      { q: 'Can bank statement entries be imported?', a: 'Yes: put each entry as a Payment or Receipt voucher (or let the converter match a bank statement’s Withdrawal and Deposit columns to Debit and Credit) with the bank ledger on the other side.' },
      { q: 'Does it import stock items?', a: 'No. Vouchers here are accounting vouchers (ledgers and amounts). Sales and purchases with items need Tally’s invoice mode.' },
    ],
    featureList: ['Bulk import of eight voucher types', 'Excel template or XML', 'Duplicate and missing ledger checks', 'Pick the vouchers to import'],
    limits: FILES,
    related: ['tally-xml-import', 'tally-journal-entry-excel', 'excel-to-tally-xml-converter', 'tally-journal-entry-templates'],
    keywords: ['tally voucher import', 'import vouchers in tally', 'bulk voucher import tally', 'import payment vouchers in tally from excel', 'import sales voucher in tally'],
  },
  {
    slug: 'tally-voucher-export',
    category: 'tally',
    no: 75,
    updated: UPDATED,
    opens: 'tally-xml-export',
    name: 'Tally Voucher Export',
    short: 'Get vouchers out of Tally as Excel or XML',
    title: 'Tally Voucher Export – Vouchers to Excel or XML',
    description: 'Export vouchers from Tally and pick what you need: by voucher type, financial year, number or ledger. Download them as Excel with every ledger line, or as clean XML.',
    h1: 'Export vouchers from Tally',
    intro:
      'Need last year’s payments in Excel for the auditor, or a set of journal entries to repeat in another company? Export the Day Book from Tally as XML, open it here, filter down to the vouchers you need, and download them as a spreadsheet with every ledger line, or as XML ready to import elsewhere.',
    steps: ['In Tally: Day Book → F2 for the period → Alt+E → Format: XML.', 'Open the file here and filter by type, dates, number or ledger.', 'Download the vouchers as Excel or XML.'],
    sections: [
      {
        h2: 'What the Excel export contains',
        list: [
          'Every ledger line with voucher date, type, number, reference and narration.',
          'Debit and credit in separate columns, totals per voucher on the summary sheet.',
          'Bill-wise details, cost centres and bank details on their own sheets.',
          'The same layout as the import template, so the sheet can go back into Tally after editing.',
        ],
      },
      {
        h2: 'Common reasons to export vouchers',
        list: [
          'Audit and tax work: a year of vouchers of one type, sortable and filterable.',
          'Moving entries: the same vouchers in another company, with ledgers renamed through the [Tally XML Converter](/tally-xml-converter).',
          'Review: all vouchers touching one ledger in a period.',
        ],
      },
    ],
    faqs: [
      { q: 'Can I export only sales or only payments?', a: 'Yes. Choose the voucher type in the filter: "Sales" includes custom types made from Sales, such as "Sales GST". You can also choose an exact type name from the file.' },
      { q: 'Does it work with Tally.ERP 9?', a: 'Yes. Export the Day Book with Alt+E in Tally.ERP 9 the same way.' },
      { q: 'Is my data uploaded?', a: 'No. The exported file is read in your browser.' },
    ],
    featureList: ['Filter by voucher type, financial year, dates, number and ledger', 'Excel with every ledger line', 'XML for another company', 'TallyPrime and Tally.ERP 9'],
    limits: FILES,
    related: ['tally-xml-export', 'tally-xml-to-excel-converter', 'tally-xml-converter', 'tally-voucher-import'],
    keywords: ['tally voucher export', 'export vouchers from tally to excel', 'tally day book export', 'export journal vouchers from tally', 'tally prime export vouchers'],
  },
];
