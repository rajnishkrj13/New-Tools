import { describe, expect, it } from 'vitest';
import { buildPayload, TYPES, type Fields, type QrType } from '../src/lib/qr/payload';
import { readContent } from '../src/lib/qr/read';

/** A code as the generator makes it. */
const made = (type: QrType, f: Fields) => {
  const t = TYPES.find((x) => x.value === type)!;
  const built = buildPayload(type, { ...t.initial, ...f });
  if (!built.data) throw new Error(built.error ?? 'no data');
  return built.data;
};
const field = (c: ReturnType<typeof readContent>, label: string) => c.fields.find((f) => f[0] === label)?.[1];

describe('reading scanned codes', () => {
  it('reads back what the generator writes', () => {
    const wifi = readContent(made('wifi', { ssid: 'Cafe; Guest', password: 'pa:ss,word', security: 'WPA' }));
    expect(wifi.kind).toBe('wifi');
    expect(field(wifi, 'Network name')).toBe('Cafe; Guest');
    expect(field(wifi, 'Password')).toBe('pa:ss,word');

    const upi = readContent(made('upi', { vpa: 'shop@okaxis', name: 'Sharma Store', amount: '250', note: 'Bill 12' }));
    expect(upi).toMatchObject({ kind: 'upi', href: expect.stringMatching(/^upi:\/\/pay\?/) });
    expect(field(upi, 'Pay to (UPI ID)')).toBe('shop@okaxis');
    expect(field(upi, 'Name')).toBe('Sharma Store');
    expect(field(upi, 'Amount')).toBe('₹250.00');
    expect(field(upi, 'Note')).toBe('Bill 12');
    expect(upi.warn.join(' ')).toContain('never need to scan a code or enter your PIN to receive money');

    const card = readContent(made('vcard', { first: 'Asha', last: 'Rao', phone: '+91 98765 43210', email: 'asha@example.com', org: 'Rao & Co', address: 'MG Road, Pune' }));
    expect(card.kind).toBe('contact');
    expect(field(card, 'Name')).toBe('Asha Rao');
    expect(field(card, 'Email')).toBe('asha@example.com');
    expect(field(card, 'Mobile')).toBe('+919876543210');
    expect(field(card, 'Address')).toBe('MG Road, Pune');
    expect(field(card, 'Company')).toBe('Rao & Co');

    const wa = readContent(made('whatsapp', { phone: '+91 98765 43210', message: 'Hi, I saw your shop' }));
    expect(wa).toMatchObject({ kind: 'whatsapp', fields: [['Number', '+919876543210'], ['Message', 'Hi, I saw your shop']] });

    const mail = readContent(made('email', { to: 'help@example.com', subject: 'Order 5', body: 'Hello' }));
    expect(mail.fields).toEqual([['To', 'help@example.com'], ['Subject', 'Order 5'], ['Message', 'Hello']]);

    const sms = readContent(made('sms', { phone: '+919876543210', message: 'Book a table' }));
    expect(sms).toMatchObject({ kind: 'sms', fields: [['Number', '+919876543210'], ['Message', 'Book a table']] });

    const ev = readContent(made('event', { title: 'Diwali sale', start: '2026-11-01T10:00', end: '2026-11-01T18:00', place: 'Main Bazaar' }));
    expect(ev.kind).toBe('event');
    expect(field(ev, 'Event')).toBe('Diwali sale');
    expect(field(ev, 'Place')).toBe('Main Bazaar');
  });

  it('points out links to check', () => {
    expect(readContent('https://toolyverse.com/qr-code-generator')).toMatchObject({ kind: 'url', fields: [['Link', 'https://toolyverse.com/qr-code-generator'], ['Website', 'toolyverse.com']], warn: [] });
    expect(readContent('http://example.com').warn.join()).toContain('not https');
    expect(readContent('https://bit.ly/3abc').warn.join()).toContain('short link');
    expect(readContent('https://paytm.com@evil.example/pay').warn.join()).toContain('evil.example');
    expect(readContent('www.example.com/menu')).toMatchObject({ kind: 'url', href: 'https://www.example.com/menu' });
  });

  it('reads other common layouts', () => {
    expect(readContent('MECARD:N:Rao,Asha;TEL:9876543210;EMAIL:a@b.in;;')).toMatchObject({ kind: 'contact', fields: [['Name', 'Asha Rao'], ['Phone', '9876543210'], ['Email', 'a@b.in']] });
    expect(readContent('WIFI:S:Home;T:nopass;;').fields).toEqual([['Network name', 'Home'], ['Password', 'None (open network)'], ['Security', 'None']]);
    expect(readContent('geo:28.6139,77.2090?q=India Gate')).toMatchObject({ kind: 'location', href: 'https://www.google.com/maps?q=28.6139,77.2090' });
    expect(readContent('tel:+911234567890')).toMatchObject({ kind: 'phone', href: 'tel:+911234567890' });
    expect(readContent('Table 7')).toMatchObject({ kind: 'text', fields: [['Text', 'Table 7']] });
    expect(readContent('upi://pay?pa=x@ybl&pn=X').fields[2]).toEqual(['Amount', 'You type the amount']);
  });
});
