/**
 * Ready-made accounting entries to start from. Ledger names are suggestions to be changed to the
 * company's own; amounts are shares of one base amount (100 = the base). They are common
 * examples, not advice: the right entry depends on the facts and the company's policies.
 */
import { round2, type Entry, type Voucher } from './model';

export interface TemplateLine {
  ledger: string;
  side: 'Dr' | 'Cr';
  /** Share of the base amount in percent. */
  pct: number;
}

export interface Template {
  id: string;
  category: string;
  name: string;
  type: string;
  narration: string;
  lines: TemplateLine[];
  /** Saved by the visitor (not built in). */
  custom?: boolean;
}

export const TEMPLATE_CATEGORIES = ['General accounting', 'GST and taxes', 'Banking and finance', 'Payroll', 'Fixed assets', 'Business operations', 'Intercompany and branches'] as const;

/** "Dr Rent 100 | Cr Rent Payable 100" → lines. */
function lines(spec: string): TemplateLine[] {
  return spec.split('|').map((part) => {
    const m = /^\s*(Dr|Cr)\s+(.+?)\s+([\d.]+)\s*$/.exec(part);
    if (!m) throw new Error(`Bad template line: ${part}`);
    return { side: m[1] as 'Dr' | 'Cr', ledger: m[2], pct: Number(m[3]) };
  });
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

type Row = [name: string, type: string, spec: string, narration: string];

const DATA: Record<(typeof TEMPLATE_CATEGORIES)[number], Row[]> = {
  'General accounting': [
    ['Basic journal entry', 'Journal', 'Dr Expense Ledger 100 | Cr Party Ledger 100', 'Being amount booked'],
    ['Adjustment entry', 'Journal', 'Dr Correct Ledger 100 | Cr Wrong Ledger 100', 'Being amount adjusted to the correct ledger'],
    ['Opening balance entry', 'Journal', 'Dr Asset Ledger 100 | Cr Capital Account 100', 'Being opening balance brought forward'],
    ['Closing entry: transfer of net profit', 'Journal', 'Dr Profit & Loss A/c 100 | Cr Capital Account 100', 'Being net profit for the year transferred to capital'],
    ['Rectification entry', 'Journal', 'Dr Correct Ledger 100 | Cr Suspense A/c 100', 'Being error rectified'],
    ['Reversal of previous entry', 'Journal', 'Dr Party Ledger 100 | Cr Expense Ledger 100', 'Being entry dated … reversed'],
    ['Transfer between ledgers', 'Journal', 'Dr New Ledger 100 | Cr Old Ledger 100', 'Being balance transferred'],
    ['Provision for expense', 'Journal', 'Dr Expense Ledger 100 | Cr Provision for Expenses 100', 'Being provision made for the month'],
    ['Accrued expense', 'Journal', 'Dr Expense Ledger 100 | Cr Outstanding Expenses 100', 'Being expense accrued for the period'],
    ['Outstanding expenses', 'Journal', 'Dr Expense Ledger 100 | Cr Outstanding Expenses 100', 'Being expenses due but not paid'],
    ['Prepaid expenses', 'Journal', 'Dr Prepaid Expenses 100 | Cr Expense Ledger 100', 'Being expense relating to next period carried forward'],
    ['Income receivable (accrued income)', 'Journal', 'Dr Income Receivable 100 | Cr Income Ledger 100', 'Being income earned but not received'],
    ['Income received in advance', 'Journal', 'Dr Income Ledger 100 | Cr Income Received in Advance 100', 'Being income relating to next period carried forward'],
    ['Depreciation', 'Journal', 'Dr Depreciation 100 | Cr Fixed Asset Ledger 100', 'Being depreciation charged for the period'],
    ['Bad debts written off', 'Journal', 'Dr Bad Debts 100 | Cr Customer Ledger 100', 'Being amount not recoverable written off'],
    ['Provision for doubtful debts', 'Journal', 'Dr Provision for Doubtful Debts (Expense) 100 | Cr Provision for Doubtful Debts 100', 'Being provision created on debtors'],
    ['Small balance written off', 'Journal', 'Dr Sundry Balances Written Off 100 | Cr Party Ledger 100', 'Being small balance written off'],
    ['Round-off adjustment', 'Journal', 'Dr Round Off 100 | Cr Party Ledger 100', 'Being rounding difference adjusted'],
  ],
  'GST and taxes': [
    ['Purchase with CGST and SGST (18%)', 'Purchase', 'Dr Purchase 100 | Dr Input CGST 9 | Dr Input SGST 9 | Cr Supplier Ledger 118', 'Being goods purchased'],
    ['Purchase with IGST (18%)', 'Purchase', 'Dr Purchase 100 | Dr Input IGST 18 | Cr Supplier Ledger 118', 'Being inter-state purchase'],
    ['Sale with CGST and SGST (18%)', 'Sales', 'Dr Customer Ledger 118 | Cr Sales 100 | Cr Output CGST 9 | Cr Output SGST 9', 'Being goods sold'],
    ['Sale with IGST (18%)', 'Sales', 'Dr Customer Ledger 118 | Cr Sales 100 | Cr Output IGST 18', 'Being inter-state sale'],
    ['Expense with input CGST and SGST', 'Journal', 'Dr Expense Ledger 100 | Dr Input CGST 9 | Dr Input SGST 9 | Cr Supplier Ledger 118', 'Being expense booked with GST'],
    ['GST set-off: output against input credit', 'Journal', 'Dr Output CGST 100 | Dr Output SGST 100 | Cr Input CGST 100 | Cr Input SGST 100', 'Being input tax credit set off against output tax'],
    ['IGST credit used against CGST and SGST', 'Journal', 'Dr Output CGST 50 | Dr Output SGST 50 | Cr Input IGST 100', 'Being IGST credit utilised'],
    ['GST payable transferred after set-off', 'Journal', 'Dr Output CGST 100 | Dr Output SGST 100 | Cr GST Payable 200', 'Being net GST liability transferred'],
    ['GST paid (challan)', 'Payment', 'Dr GST Payable 100 | Cr Bank Account 100', 'Being GST paid through challan'],
    ['Reverse charge: liability and credit', 'Journal', 'Dr Expense Ledger 100 | Dr Input CGST (RCM) 9 | Dr Input SGST (RCM) 9 | Cr Supplier Ledger 100 | Cr CGST Payable (RCM) 9 | Cr SGST Payable (RCM) 9', 'Being expense under reverse charge'],
    ['GST receivable adjustment (refund claimed)', 'Journal', 'Dr GST Refund Receivable 100 | Cr Input IGST 100', 'Being refund of input tax claimed'],
    ['TDS deducted on expense (194J)', 'Journal', 'Dr Professional Fees 100 | Cr TDS Payable 194J 10 | Cr Supplier Ledger 90', 'Being professional fees booked after TDS'],
    ['TDS deducted on rent (194I)', 'Journal', 'Dr Rent 100 | Cr TDS Payable 194I 10 | Cr Landlord Ledger 90', 'Being rent booked after TDS'],
    ['TDS paid to government', 'Payment', 'Dr TDS Payable 100 | Cr Bank Account 100', 'Being TDS deposited'],
    ['TDS deducted by customer (TDS receivable)', 'Journal', 'Dr TDS Receivable 10 | Cr Customer Ledger 10', 'Being TDS deducted by customer as per Form 26AS'],
    ['TCS collected on sale', 'Sales', 'Dr Customer Ledger 100.1 | Cr Sales 100 | Cr TCS Payable 0.1', 'Being sale with TCS collected'],
    ['GST interest and late fee', 'Payment', 'Dr Interest on GST 70 | Dr GST Late Fee 30 | Cr Bank Account 100', 'Being interest and late fee paid'],
    ['GST credit note (sales return) adjustment', 'Credit Note', 'Dr Sales Returns 100 | Dr Output CGST 9 | Dr Output SGST 9 | Cr Customer Ledger 118', 'Being goods returned by customer'],
    ['GST debit note (purchase return) adjustment', 'Debit Note', 'Dr Supplier Ledger 118 | Cr Purchase Returns 100 | Cr Input CGST 9 | Cr Input SGST 9', 'Being goods returned to supplier'],
    ['Ineligible input credit reversed', 'Journal', 'Dr Expense Ledger 100 | Cr Input CGST 50 | Cr Input SGST 50', 'Being ineligible input tax credit reversed'],
  ],
  'Banking and finance': [
    ['Bank charges', 'Payment', 'Dr Bank Charges 100 | Cr Bank Account 100', 'Being bank charges debited'],
    ['Interest received on deposit', 'Receipt', 'Dr Bank Account 100 | Cr Interest Received 100', 'Being interest credited by bank'],
    ['Interest paid on loan', 'Payment', 'Dr Interest on Loan 100 | Cr Bank Account 100', 'Being interest paid'],
    ['Loan received', 'Receipt', 'Dr Bank Account 100 | Cr Term Loan 100', 'Being loan disbursed'],
    ['Loan repayment', 'Payment', 'Dr Term Loan 100 | Cr Bank Account 100', 'Being loan repaid'],
    ['EMI split into principal and interest', 'Payment', 'Dr Term Loan 80 | Dr Interest on Loan 20 | Cr Bank Account 100', 'Being EMI paid: principal and interest'],
    ['Bank reconciliation adjustment', 'Journal', 'Dr Bank Account 100 | Cr Suspense A/c 100', 'Being entry passed after bank reconciliation'],
    ['Cheque dishonoured (customer)', 'Journal', 'Dr Customer Ledger 100 | Cr Bank Account 100', 'Being cheque returned unpaid'],
    ['Cheque dishonour charges recovered', 'Journal', 'Dr Customer Ledger 100 | Cr Bank Charges 100', 'Being cheque return charges recovered from customer'],
    ['Foreign exchange gain', 'Journal', 'Dr Customer Ledger 100 | Cr Foreign Exchange Gain 100', 'Being exchange gain on realisation'],
    ['Foreign exchange loss', 'Journal', 'Dr Foreign Exchange Loss 100 | Cr Customer Ledger 100', 'Being exchange loss on realisation'],
    ['Payment gateway settlement with charges', 'Receipt', 'Dr Bank Account 97.64 | Dr Payment Gateway Charges 2 | Dr Input IGST 0.36 | Cr Payment Gateway Receivable 100', 'Being gateway settlement received after charges'],
    ['Credit card charges', 'Payment', 'Dr Credit Card Charges 100 | Cr Credit Card Account 100', 'Being card charges booked'],
    ['Transfer between own bank accounts', 'Contra', 'Dr Bank Account 2 100 | Cr Bank Account 1 100', 'Being funds transferred'],
    ['Cash deposited into bank', 'Contra', 'Dr Bank Account 100 | Cr Cash 100', 'Being cash deposited'],
    ['Cash withdrawn from bank', 'Contra', 'Dr Cash 100 | Cr Bank Account 100', 'Being cash withdrawn'],
  ],
  Payroll: [
    ['Salary provision for the month', 'Journal', 'Dr Salary 100 | Cr Salary Payable 88 | Cr PF Payable 6 | Cr ESI Payable 1 | Cr Professional Tax Payable 1 | Cr TDS Payable 192 4', 'Being salary for the month provided'],
    ['Salary paid', 'Payment', 'Dr Salary Payable 100 | Cr Bank Account 100', 'Being salary paid'],
    ['Employer PF and ESI contribution', 'Journal', 'Dr Employer PF Contribution 75 | Dr Employer ESI Contribution 25 | Cr PF Payable 75 | Cr ESI Payable 25', 'Being employer contribution provided'],
    ['PF paid', 'Payment', 'Dr PF Payable 100 | Cr Bank Account 100', 'Being PF deposited'],
    ['ESI paid', 'Payment', 'Dr ESI Payable 100 | Cr Bank Account 100', 'Being ESI deposited'],
    ['Professional tax paid', 'Payment', 'Dr Professional Tax Payable 100 | Cr Bank Account 100', 'Being professional tax deposited'],
    ['Employee advance given', 'Payment', 'Dr Employee Advance 100 | Cr Bank Account 100', 'Being advance given to employee'],
    ['Salary advance recovered from salary', 'Journal', 'Dr Salary Payable 100 | Cr Employee Advance 100', 'Being advance recovered from salary'],
    ['Gratuity provision', 'Journal', 'Dr Gratuity 100 | Cr Provision for Gratuity 100', 'Being gratuity provided for the year'],
    ['Bonus provision', 'Journal', 'Dr Bonus 100 | Cr Bonus Payable 100', 'Being bonus provided'],
    ['Employee reimbursement', 'Journal', 'Dr Conveyance 60 | Dr Staff Welfare 40 | Cr Employee Reimbursement Payable 100', 'Being expenses reimbursable to employee'],
    ['Staff welfare expense', 'Payment', 'Dr Staff Welfare 100 | Cr Bank Account 100', 'Being staff welfare expense paid'],
    ['Leave encashment provision', 'Journal', 'Dr Leave Encashment 100 | Cr Provision for Leave Encashment 100', 'Being leave encashment provided'],
  ],
  'Fixed assets': [
    ['Fixed asset purchase adjustment', 'Journal', 'Dr Fixed Asset Ledger 100 | Cr Expense Ledger 100', 'Being capital item wrongly expensed, capitalised'],
    ['Asset purchased on credit with GST', 'Purchase', 'Dr Plant & Machinery 100 | Dr Input CGST 9 | Dr Input SGST 9 | Cr Supplier Ledger 118', 'Being asset purchased'],
    ['Asset capitalisation from CWIP', 'Journal', 'Dr Building 100 | Cr Capital Work-in-Progress 100', 'Being asset put to use and capitalised'],
    ['Depreciation on fixed assets', 'Journal', 'Dr Depreciation 100 | Cr Plant & Machinery 60 | Cr Furniture & Fixtures 25 | Cr Computers 15', 'Being depreciation for the year'],
    ['Asset disposal: book value removed', 'Journal', 'Dr Asset Disposal A/c 100 | Cr Fixed Asset Ledger 100', 'Being written down value of asset sold transferred'],
    ['Asset sold at a profit', 'Journal', 'Dr Buyer Ledger 120 | Cr Fixed Asset Ledger 100 | Cr Profit on Sale of Asset 20', 'Being asset sold above book value'],
    ['Asset sold at a loss', 'Journal', 'Dr Buyer Ledger 80 | Dr Loss on Sale of Asset 20 | Cr Fixed Asset Ledger 100', 'Being asset sold below book value'],
    ['Fixed asset written off', 'Journal', 'Dr Assets Written Off 100 | Cr Fixed Asset Ledger 100', 'Being asset discarded and written off'],
    ['Transfer to capital work-in-progress', 'Journal', 'Dr Capital Work-in-Progress 100 | Cr Supplier Ledger 100', 'Being construction cost booked to CWIP'],
    ['CWIP adjustment', 'Journal', 'Dr Capital Work-in-Progress 100 | Cr Expense Ledger 100', 'Being expense attributable to construction moved to CWIP'],
  ],
  'Business operations': [
    ['Rent payable', 'Journal', 'Dr Rent 100 | Cr Rent Payable 100', 'Being rent for the month payable'],
    ['Electricity expense accrued', 'Journal', 'Dr Electricity Charges 100 | Cr Outstanding Expenses 100', 'Being electricity for the month accrued'],
    ['Telephone and internet expenses', 'Journal', 'Dr Telephone Expenses 50 | Dr Internet Charges 50 | Cr Supplier Ledger 100', 'Being telephone and internet bills booked'],
    ['Insurance: prepaid portion carried forward', 'Journal', 'Dr Prepaid Insurance 100 | Cr Insurance 100', 'Being unexpired insurance carried forward'],
    ['Insurance: prepaid portion expensed', 'Journal', 'Dr Insurance 100 | Cr Prepaid Insurance 100', 'Being insurance for the month charged'],
    ['Advertisement expenses', 'Journal', 'Dr Advertisement Expenses 100 | Cr Supplier Ledger 100', 'Being advertisement bill booked'],
    ['Marketing expense accrued', 'Journal', 'Dr Marketing Expenses 100 | Cr Outstanding Expenses 100', 'Being marketing expenses accrued'],
    ['Franchise royalty payable', 'Journal', 'Dr Royalty 100 | Cr Franchisor Ledger 100', 'Being royalty for the period payable'],
    ['Subscription charges', 'Journal', 'Dr Subscription Charges 100 | Cr Supplier Ledger 100', 'Being subscription booked'],
    ['Manpower expense provision', 'Journal', 'Dr Manpower Charges 100 | Cr Provision for Expenses 100', 'Being manpower charges provided'],
    ['Inventory shortage written off', 'Journal', 'Dr Stock Shortage 100 | Cr Purchase 100', 'Being stock shortage found on verification. Use a Physical Stock or Stock Journal voucher to adjust quantities.'],
    ['Inventory excess found', 'Journal', 'Dr Purchase 100 | Cr Stock Excess 100', 'Being excess stock found on verification. Use a Physical Stock or Stock Journal voucher to adjust quantities.'],
    ['Petty cash expenses', 'Payment', 'Dr Printing & Stationery 40 | Dr Conveyance 35 | Dr Office Expenses 25 | Cr Petty Cash 100', 'Being petty expenses paid'],
    ['Customer payment received', 'Receipt', 'Dr Bank Account 100 | Cr Customer Ledger 100', 'Being payment received'],
    ['Supplier payment made', 'Payment', 'Dr Supplier Ledger 100 | Cr Bank Account 100', 'Being payment made'],
  ],
  'Intercompany and branches': [
    ['Intercompany receivable', 'Journal', 'Dr Group Company Receivable 100 | Cr Income Ledger 100', 'Being amount recoverable from group company'],
    ['Intercompany payable', 'Journal', 'Dr Expense Ledger 100 | Cr Group Company Payable 100', 'Being amount payable to group company'],
    ['Related party transaction', 'Journal', 'Dr Related Party Ledger 100 | Cr Income Ledger 100', 'Being transaction with related party'],
    ['Head office to branch transfer (head office books)', 'Journal', 'Dr Branch Account 100 | Cr Bank Account 100', 'Being funds sent to branch'],
    ['Head office to branch transfer (branch books)', 'Journal', 'Dr Bank Account 100 | Cr Head Office Account 100', 'Being funds received from head office'],
    ['Intercompany expense allocation', 'Journal', 'Dr Group Company Receivable 100 | Cr Expense Ledger 100', 'Being share of common expenses recovered'],
    ['Intercompany income allocation', 'Journal', 'Dr Income Ledger 100 | Cr Group Company Payable 100', 'Being share of income due to group company'],
    ['Expense split across cost centres', 'Journal', 'Dr Expense Ledger 100 | Cr Allocation Clearing 100', 'Being expense allocated to cost centres (add the split in the Cost Centre column)'],
    ['Franchise adjustment', 'Journal', 'Dr Franchisee Ledger 100 | Cr Franchise Fee Income 100', 'Being franchise fee for the period'],
    ['Balance transfer between companies', 'Journal', 'Dr Company B Account 100 | Cr Company A Account 100', 'Being balance transferred'],
  ],
};

export const TEMPLATES: Template[] = Object.entries(DATA).flatMap(([category, rows]) =>
  rows.map(([name, type, spec, narration]) => ({ id: slug(name), category, name, type, narration, lines: lines(spec) })),
);

/** A voucher filled from a template for a base amount. */
export function fromTemplate(t: Template, base: number, date: string, number = ''): Voucher {
  const raw = t.lines.map((l) => ({ ...l, amt: round2((base * l.pct) / 100) }));
  // Put any rounding difference on the largest line of the shorter side, so the voucher balances.
  const dr = round2(raw.filter((l) => l.side === 'Dr').reduce((n, l) => n + l.amt, 0));
  const cr = round2(raw.filter((l) => l.side === 'Cr').reduce((n, l) => n + l.amt, 0));
  const diff = round2(dr - cr);
  if (diff && Math.abs(diff) < 1) {
    const side = diff > 0 ? 'Cr' : 'Dr';
    const target = raw.filter((l) => l.side === side).sort((a, b) => b.amt - a.amt)[0];
    if (target) target.amt = round2(target.amt + Math.abs(diff));
  }
  const entries: Entry[] = raw.map((l) => ({ ledger: l.ledger, dr: l.side === 'Dr' ? l.amt : 0, cr: l.side === 'Cr' ? l.amt : 0, costCategory: '', costCentres: [], bills: [] }));
  return { date, type: t.type, number, reference: '', referenceDate: '', narration: t.narration, entries };
}

/** A visitor's own template from a voucher: amounts become shares of the total debit. */
export function toTemplate(v: Voucher, name: string, category = 'My templates'): Template {
  const total = v.entries.reduce((n, e) => n + (e.dr || 0), 0) || 1;
  return {
    id: `my-${slug(name)}-${v.entries.length}`,
    category,
    name,
    type: v.type,
    narration: v.narration,
    custom: true,
    lines: v.entries.filter((e) => e.ledger).map((e) => ({ ledger: e.ledger, side: e.dr ? 'Dr' : 'Cr', pct: round2(((e.dr || e.cr) / total) * 100 * 1000) / 1000 })),
  };
}
