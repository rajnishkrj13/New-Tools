import { describe, expect, it } from 'vitest';
import { checkGstin, gst, gstinCheckChar, r2 } from '../src/lib/calc/gst';
import { groupIndian, numberToWords } from '../src/lib/calc/words';
import { UNIT_GROUPS, convert, tidy } from '../src/lib/calc/units';
import { changeCase, countText, dateDiff } from '../src/lib/calc/text';

describe('GST', () => {
  it('adds and removes GST', () => {
    expect(gst(1000, 18, 'add')).toMatchObject({ base: 1000, tax: 180, total: 1180, cgst: 90, sgst: 90, igst: 180 });
    const back = gst(1180, 18, 'remove');
    expect(r2(back.base)).toBe(1000);
    expect(r2(back.tax)).toBe(180);
  });

  it('computes the GSTIN check character', () => {
    // Published sample GSTINs with known check characters.
    expect(gstinCheckChar('27AAPFU0939F1Z')).toBe('V');
    expect(gstinCheckChar('29AAGCB7383J1Z')).toBe('4');
  });

  it('explains what is wrong with a GSTIN', () => {
    const ok = checkGstin('27aapfu0939f1zv');
    expect(ok.valid).toBe(true);
    expect(ok.state).toBe('Maharashtra');
    expect(ok.pan).toBe('AAPFU0939F');
    expect(ok.panHolder).toBe('Firm / LLP');
    const typo = checkGstin('27AAPFU0939F1ZW');
    expect(typo.valid).toBe(false);
    expect(typo.problems[0]).toContain('"V"');
    expect(checkGstin('27AAPFU0939').problems[0]).toContain('11 characters');
    expect(checkGstin('00AAPFU0939F1ZV').valid).toBe(false);
  });
});

describe('number to words', () => {
  it('writes Indian style with lakh and crore', () => {
    expect(numberToWords('1234567', { style: 'indian', currency: 'none' })).toBe('Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven');
    expect(numberToWords('1,00,00,000', { style: 'indian', currency: 'none' })).toBe('One Crore');
    expect(numberToWords('123456789012', { style: 'indian', currency: 'none' })).toBe(
      'Twelve Thousand Three Hundred Forty-Five Crore Sixty-Seven Lakh Eighty-Nine Thousand Twelve',
    );
  });

  it('writes rupees and paise', () => {
    expect(numberToWords('1234567.50', { style: 'indian', currency: 'inr' })).toBe('Rupees Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven and Fifty Paise Only');
    expect(numberToWords('0.75', { style: 'indian', currency: 'inr' })).toBe('Seventy-Five Paise Only');
    expect(numberToWords('99.999', { style: 'indian', currency: 'inr' })).toBe('Rupees One Hundred Only');
  });

  it('writes international style and decimals', () => {
    expect(numberToWords('2500000', { style: 'international', currency: 'none' })).toBe('Two Million Five Hundred Thousand');
    expect(numberToWords('12.05', { style: 'international', currency: 'none' })).toBe('Twelve Point Zero Five');
    expect(() => numberToWords('12a', { style: 'indian', currency: 'none' })).toThrow();
  });

  it('groups digits the Indian way', () => {
    expect(groupIndian('1234567.50')).toBe('12,34,567.50');
    expect(groupIndian('999')).toBe('999');
  });
});

describe('units', () => {
  const unit = (g: string, u: string) => UNIT_GROUPS.find((x) => x.id === g)!.units.find((x) => x.id === u)!;
  it('converts lengths, temperatures and land', () => {
    expect(tidy(convert(1, unit('length', 'in'), unit('length', 'cm')))).toBe('2.54');
    expect(tidy(convert(100, unit('temperature', 'c'), unit('temperature', 'f')))).toBe('212');
    expect(tidy(convert(1, unit('area', 'acre'), unit('area', 'sqyd')))).toBe('4840');
    expect(tidy(convert(1, unit('area', 'bigha'), unit('area', 'sqyd')))).toBe('1600');
  });
});

describe('text', () => {
  it('changes case', () => {
    expect(changeCase('the lord of the rings', 'title')).toBe('The Lord of the Rings');
    expect(changeCase('HELLO WORLD. how are you? i am fine', 'sentence')).toBe('Hello world. How are you? I am fine');
    expect(changeCase('Hello big World', 'camel')).toBe('helloBigWorld');
    expect(changeCase('Hello big World', 'kebab')).toBe('hello-big-world');
  });

  it('counts words in any script', () => {
    const c = countText('नमस्ते दुनिया. Hello world!\n\nSecond para.');
    expect(c.words).toBe(6);
    expect(c.paragraphs).toBe(2);
    expect(c.sentences).toBe(3);
  });

  it('measures age in calendar terms', () => {
    expect(dateDiff(new Date(2000, 0, 31), new Date(2000, 2, 1))).toMatchObject({ years: 0, months: 1, days: 1, totalDays: 30 });
    expect(dateDiff(new Date(1990, 5, 15), new Date(2026, 10, 16))).toMatchObject({ years: 36, months: 5, days: 1 });
  });
});
