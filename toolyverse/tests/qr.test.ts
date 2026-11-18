import { describe, expect, it } from 'vitest';
import { buildPayload, normalizeUrl, TYPES } from '../src/lib/qr/payload';
import { DEFAULT_STYLE, colourProblems, encode, logoCover, renderSvg } from '../src/lib/qr/render';

/** The text inside each kind of QR code, in the exact format phones act on. */

describe('QR code contents', () => {
  it('adds https:// to bare links and rejects things that are not web addresses', () => {
    expect(normalizeUrl('example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(normalizeUrl('http://x.in')).toBe('http://x.in');
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('hello')).toBeNull();
  });

  it('writes WiFi codes with escaped special characters', () => {
    expect(buildPayload('wifi', { ssid: 'My;Net', password: 'pa:ss,word"1', security: 'WPA', hidden: '' }).data).toBe('WIFI:T:WPA;S:My\\;Net;P:pa\\:ss\\,word\\"1;;');
    expect(buildPayload('wifi', { ssid: 'Cafe', password: '', security: 'nopass', hidden: 'true' }).data).toBe('WIFI:T:nopass;S:Cafe;H:true;;');
    expect(buildPayload('wifi', { ssid: 'Cafe', password: 'short', security: 'WPA' }).error).toMatch(/8 characters/);
  });

  it('writes UPI links that payment apps accept', () => {
    expect(buildPayload('upi', { vpa: 'Shop.Name@okaxis', name: 'Ram & Sons', amount: '250', note: 'Bill 12' }).data).toBe('upi://pay?pa=shop.name@okaxis&pn=Ram%20%26%20Sons&am=250.00&cu=INR&tn=Bill%2012');
    expect(buildPayload('upi', { vpa: 'shop@okaxis' }).data).toBe('upi://pay?pa=shop@okaxis&cu=INR');
    expect(buildPayload('upi', { vpa: 'not-an-id' }).error).toBeTruthy();
    expect(buildPayload('upi', { vpa: 'a@ybl', amount: '12.345' }).error).toBeTruthy();
  });

  it('writes WhatsApp links with the country code and message', () => {
    expect(buildPayload('whatsapp', { phone: '+91 98765-43210', message: 'Hi there' }).data).toBe('https://wa.me/919876543210?text=Hi%20there');
    expect(buildPayload('whatsapp', { phone: '9876543210' }).error).toMatch(/country code/);
  });

  it('writes vCards, events, email, SMS and phone in their standard formats', () => {
    const v = buildPayload('vcard', { first: 'Asha', last: 'Rao', phone: '+91 98765 43210', email: 'asha@example.com', org: 'Rao, Sons & Co', website: 'rao.in' }).data!;
    expect(v.split('\r\n')).toEqual(['BEGIN:VCARD', 'VERSION:3.0', 'N:Rao;Asha;;;', 'FN:Asha Rao', 'ORG:Rao\\, Sons & Co', 'TEL;TYPE=CELL:+919876543210', 'EMAIL:asha@example.com', 'URL:https://rao.in', 'END:VCARD']);
    const e = buildPayload('event', { title: 'Launch', start: '2026-12-01T18:30', end: '2026-12-01T20:00', place: 'Hall 2' }).data!;
    expect(e).toContain('DTSTART:20261201T183000');
    expect(e).toContain('DTEND:20261201T200000');
    expect(buildPayload('event', { title: 'x', start: '2026-12-02T10:00', end: '2026-12-01T10:00' }).error).toBeTruthy();
    expect(buildPayload('email', { to: 'a@b.co', subject: 'Hello there', body: 'Line' }).data).toBe('mailto:a@b.co?subject=Hello%20there&body=Line');
    expect(buildPayload('sms', { phone: '98765 43210', message: 'Hi' }).data).toBe('SMSTO:9876543210:Hi');
    expect(buildPayload('phone', { phone: '+91 (22) 1234-5678' }).data).toBe('tel:+912212345678');
  });

  it('builds social, maps, review and app links', () => {
    expect(buildPayload('instagram', { handle: '@my.shop' }).data).toBe('https://www.instagram.com/my.shop');
    expect(buildPayload('youtube', { handle: '@chan' }).data).toBe('https://www.youtube.com/@chan');
    expect(buildPayload('linkedin', { handle: 'company/acme' }).data).toBe('https://www.linkedin.com/company/acme');
    expect(buildPayload('facebook', { handle: 'https://facebook.com/page' }).data).toBe('https://facebook.com/page');
    expect(buildPayload('social', { platform: 'x', handle: 'me' }).data).toBe('https://x.com/me');
    expect(buildPayload('location', { lat: '28.6129', lng: '77.2295' }).data).toBe('https://www.google.com/maps/search/?api=1&query=28.6129,77.2295');
    expect(buildPayload('location', { query: 'India Gate, Delhi' }).data).toBe('https://www.google.com/maps/search/?api=1&query=India%20Gate%2C%20Delhi');
    expect(buildPayload('location', { query: 'https://maps.app.goo.gl/abc' }).data).toBe('https://maps.app.goo.gl/abc');
    expect(buildPayload('review', { link: 'ChIJN1t_tDeuEmsRUsoyG83frY4' }).data).toBe('https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4');
    expect(buildPayload('app', { store: 'play', link: 'com.example.app' }).data).toBe('https://play.google.com/store/apps/details?id=com.example.app');
  });

  it('asks for the missing detail on every empty form instead of making an empty code', () => {
    for (const t of TYPES) expect(buildPayload(t.value, t.initial).error, t.value).toBeTruthy();
  });
});

describe('QR code drawing', () => {
  it('encodes text, Hindi included, and draws an SVG with the three corner eyes', () => {
    const m = encode('https://toolyverse.com', 'M');
    expect(m.size).toBe(25);
    const svg = renderSvg(m, DEFAULT_STYLE);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 33 33"');
    expect(encode('नमस्ते दुनिया', 'H').size).toBeGreaterThan(20);
    for (const dots of ['rounded', 'dots'] as const) expect(renderSvg(m, { ...DEFAULT_STYLE, dots, eyeFrame: 'circle', eyeDot: 'circle', gradient: 'radial' })).toContain('radialGradient');
  });

  it('says plainly when the text is too long', () => {
    expect(() => encode('x'.repeat(5000), 'H')).toThrow(/Too much text/);
  });

  it('clears the squares behind a logo and measures how much it covers', () => {
    const m = encode('https://toolyverse.com/qr-code-generator', 'H');
    const logo = { src: 'data:image/png;base64,AAAA', width: 100, height: 100 };
    const plain = renderSvg(m, { ...DEFAULT_STYLE, ecc: 'H' });
    const withLogo = renderSvg(m, { ...DEFAULT_STYLE, ecc: 'H', logo });
    expect(withLogo).toContain('<image');
    expect(withLogo.length).toBeGreaterThan(0);
    expect(plain.match(/M\d+ \d+h/g)!.length).toBeGreaterThan(withLogo.match(/M\d+ \d+h/g)!.length);
    expect(logoCover(m, { ...DEFAULT_STYLE, logo, logoSize: 0.2 })).toBeLessThan(0.3);
  });

  it('warns about reversed or low-contrast colours', () => {
    expect(colourProblems(DEFAULT_STYLE)).toEqual([]);
    expect(colourProblems({ ...DEFAULT_STYLE, fg: '#ffffff', bg: '#000000' })[0]).toMatch(/lighter/);
    expect(colourProblems({ ...DEFAULT_STYLE, fg: '#999999', bg: '#ffffff' })[0]).toMatch(/too close/);
  });
});
