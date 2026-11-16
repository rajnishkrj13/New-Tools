import { describe, expect, it } from 'vitest';
import { findMatches, patternError, verhoeffValid, type SearchMode } from '../src/engines/TextSearch';

const find = (text: string, mode: SearchMode, query = '', matchCase = false) => findMatches(text, { mode, query, matchCase }).map((m) => text.slice(m.start, m.end));

/** A valid 12-digit Aadhaar-style number: the first eleven digits plus the Verhoeff check digit. */
function withCheckDigit(first11: string): string {
  for (let d = 0; d < 10; d++) if (verhoeffValid(first11 + d)) return first11 + d;
  throw new Error('no check digit');
}

describe('email addresses', () => {
  it('finds addresses in running text and ignores look-alikes', () => {
    expect(find('Write to asha.k+news@nirulas-group.co.in or ravi@example.com, thanks.', 'email')).toEqual(['asha.k+news@nirulas-group.co.in', 'ravi@example.com']);
    expect(find('not an address: user@ or @handle or a@b', 'email')).toEqual([]);
    expect(find('(mail: info@site.org)', 'email')).toEqual(['info@site.org']);
  });
});

describe('phone numbers', () => {
  it('finds the usual ways of writing them', () => {
    const cases = ['+91 98765 43210', '98765-43210', '(011) 2345 6789', '+1 (555) 123-4567', '022 2345 6789', '+44 20 7946 0958', '9876543210'];
    for (const c of cases) expect(find(`Call ${c} today`, 'phone'), c).toEqual([c]);
  });
  it('does not take other numbers for phone numbers', () => {
    const text = 'Invoice INV-2026-001 total $1,250.00 dated 12-03-2026 and 2026/03/12, ref 4471, pin 110001, 1,23,456.78';
    expect(find(text, 'phone')).toEqual([]);
  });
  it('finds several in one line', () => {
    expect(find('Office 022 2345 6789, mobile +91 98765 43210.', 'phone')).toEqual(['022 2345 6789', '+91 98765 43210']);
  });
});

describe('ID and card numbers', () => {
  it('finds PAN, SSN, valid Aadhaar and valid card numbers', () => {
    const aadhaar = withCheckDigit('23456789012');
    const spaced = `${aadhaar.slice(0, 4)} ${aadhaar.slice(4, 8)} ${aadhaar.slice(8)}`;
    expect(find('PAN ABCDE1234F here', 'ids')).toEqual(['ABCDE1234F']);
    expect(find('SSN 123-45-6789.', 'ids')).toEqual(['123-45-6789']);
    expect(find(`Aadhaar ${spaced} issued`, 'ids')).toEqual([spaced]);
    expect(find('Card 4111 1111 1111 1111 expires', 'ids')).toEqual(['4111 1111 1111 1111']);
    expect(find('Card 4111-1111-1111-1111', 'ids')).toEqual(['4111-1111-1111-1111']);
  });
  it('ignores numbers that fail the check digits', () => {
    expect(find('Not Aadhaar 2345 6789 0123', 'ids')).toEqual([]);
    expect(find('Not a card 4111 1111 1111 1112', 'ids')).toEqual([]);
    expect(find('plain 1234567890123456 digits and ABCDE12345 and abcde1234f', 'ids')).toEqual([]);
  });
});

describe('own patterns and plain text', () => {
  it('matches a regular expression, with or without case', () => {
    expect(find('Order A-123 and a-456 and B-789', 'regex', 'a-\\d+')).toEqual(['A-123', 'a-456']);
    expect(find('Order A-123 and a-456', 'regex', 'a-\\d+', true)).toEqual(['a-456']);
    expect(find('abc', 'regex', 'x*')).toEqual([]); // empty matches are not matches
  });
  it('reports a pattern that is not valid', () => {
    expect(patternError({ mode: 'regex', query: '(unclosed', matchCase: false })).toMatch(/\S/);
    expect(patternError({ mode: 'regex', query: 'fine\\d', matchCase: false })).toBeNull();
    expect(find('x (unclosed', 'regex', '(unclosed')).toEqual([]);
  });
  it('plain text still finds every occurrence', () => {
    expect(find('The cat and the Cat', 'text', 'cat')).toEqual(['cat', 'Cat']);
    expect(find('The cat and the Cat', 'text', 'Cat', true)).toEqual(['Cat']);
  });
});
