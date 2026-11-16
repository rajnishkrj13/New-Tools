// Builds small password-protected PDFs straight from the PDF specification (ISO 32000), with
// Node's crypto and nothing from the editor or its PDF libraries. Used to check that files made
// by other programs open: 'rc4-128' (V2/R3), 'aes-128' (V4/R4) and 'aes-256' (V5/R6).
import { createCipheriv, createHash, randomBytes } from 'node:crypto';

const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
const md5 = (...parts) => createHash('md5').update(Buffer.concat(parts)).digest();
const padPassword = (pw) => Buffer.concat([Buffer.from(pw, 'latin1'), PAD]).subarray(0, 32);

function rc4(key, data) {
  const s = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    out[n] = data[n] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}
const xorKey = (key, v) => Buffer.from(key.map((b) => b ^ v));
const hex = (b) => `<${Buffer.from(b).toString('hex')}>`;

// ---- revision 6 password hash (algorithm 2.B) ---------------------------------------------------
function hash2B(password, salt, udata = Buffer.alloc(0)) {
  let k = createHash('sha256').update(Buffer.concat([password, salt, udata])).digest();
  for (let round = 0; ; round++) {
    const k1 = Buffer.concat(Array(64).fill(Buffer.concat([password, k, udata])));
    const c = createCipheriv('aes-128-cbc', k.subarray(0, 16), k.subarray(16, 32));
    c.setAutoPadding(false);
    const e = Buffer.concat([c.update(k1), c.final()]);
    const mod = e.subarray(0, 16).reduce((a, b) => (a + b) % 3, 0);
    k = createHash(['sha256', 'sha384', 'sha512'][mod]).update(e).digest();
    if (round >= 63 && e[e.length - 1] <= round - 31) break;
  }
  return k.subarray(0, 32);
}
const aesNoPad = (alg, key, iv, data) => {
  const c = createCipheriv(alg, key, iv);
  c.setAutoPadding(false);
  return Buffer.concat([c.update(data), c.final()]);
};

/**
 * @param {{ text: string, userPassword: string, ownerPassword: string, method: 'rc4-128' | 'aes-128' | 'aes-256' }} o
 * @returns {Uint8Array}
 */
export function makeProtectedPdf({ text, userPassword, ownerPassword, method }) {
  const P = -4;
  const pBytes = Buffer.alloc(4);
  pBytes.writeInt32LE(P);
  const id = randomBytes(16);
  let fileKey;
  let encryptDict;
  let encryptObject;

  if (method === 'aes-256') {
    fileKey = randomBytes(32);
    const up = Buffer.from(userPassword, 'utf8');
    const op = Buffer.from(ownerPassword, 'utf8');
    const [uvs, uks, ovs, oks] = [randomBytes(8), randomBytes(8), randomBytes(8), randomBytes(8)];
    const U = Buffer.concat([hash2B(up, uvs), uvs, uks]);
    const UE = aesNoPad('aes-256-cbc', hash2B(up, uks), Buffer.alloc(16), fileKey);
    const O = Buffer.concat([hash2B(op, ovs, U), ovs, oks]);
    const OE = aesNoPad('aes-256-cbc', hash2B(op, oks, U), Buffer.alloc(16), fileKey);
    const perms = Buffer.concat([pBytes, Buffer.from([255, 255, 255, 255]), Buffer.from('Tadb'), randomBytes(4)]);
    const c = createCipheriv('aes-256-ecb', fileKey, null);
    c.setAutoPadding(false);
    const Perms = Buffer.concat([c.update(perms), c.final()]);
    encryptDict =
      `<< /Filter /Standard /V 5 /R 6 /Length 256 /CF << /StdCF << /CFM /AESV3 /AuthEvent /DocOpen /Length 32 >> >> ` +
      `/StmF /StdCF /StrF /StdCF /P ${P} /O ${hex(O)} /U ${hex(U)} /OE ${hex(OE)} /UE ${hex(UE)} /Perms ${hex(Perms)} >>`;
  } else {
    const n = 16;
    const r = method === 'aes-128' ? 4 : 3;
    // Owner entry (algorithm 3)
    let h = md5(padPassword(ownerPassword || userPassword));
    for (let i = 0; i < 50; i++) h = md5(h);
    const ownerKey = h.subarray(0, n);
    let O = rc4(ownerKey, padPassword(userPassword));
    for (let i = 1; i <= 19; i++) O = rc4(xorKey(ownerKey, i), O);
    // File key (algorithm 2)
    let k = md5(padPassword(userPassword), O, pBytes, id);
    for (let i = 0; i < 50; i++) k = md5(k.subarray(0, n));
    fileKey = k.subarray(0, n);
    // User entry (algorithm 5)
    let U = rc4(fileKey, md5(PAD, id));
    for (let i = 1; i <= 19; i++) U = rc4(xorKey(fileKey, i), U);
    U = Buffer.concat([U, randomBytes(16)]);
    encryptDict =
      method === 'aes-128'
        ? `<< /Filter /Standard /V 4 /R 4 /Length 128 /CF << /StdCF << /CFM /AESV2 /AuthEvent /DocOpen /Length 16 >> >> /StmF /StdCF /StrF /StdCF /P ${P} /O ${hex(O)} /U ${hex(U)} >>`
        : `<< /Filter /Standard /V 2 /R ${r} /Length 128 /P ${P} /O ${hex(O)} /U ${hex(U)} >>`;
  }
  encryptObject = encryptDict;

  /** Encrypts the data of one object. */
  const seal = (objNum, data) => {
    if (method === 'aes-256') {
      const iv = randomBytes(16);
      const c = createCipheriv('aes-256-cbc', fileKey, iv);
      return Buffer.concat([iv, c.update(data), c.final()]);
    }
    const tail = Buffer.from([objNum & 255, (objNum >> 8) & 255, (objNum >> 16) & 255, 0, 0]);
    const salt = method === 'aes-128' ? Buffer.from('sAlT') : Buffer.alloc(0);
    const key = md5(fileKey, tail, salt).subarray(0, Math.min(fileKey.length + 5, 16));
    if (method === 'aes-128') {
      const iv = randomBytes(16);
      const c = createCipheriv('aes-128-cbc', key, iv);
      return Buffer.concat([iv, c.update(data), c.final()]);
    }
    return rc4(key, data);
  };

  const content = Buffer.from(`BT /F1 24 Tf 72 700 Td (${text}) Tj ET`, 'latin1');
  const sealed = seal(4, content);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    Buffer.concat([Buffer.from(`<< /Length ${sealed.length} >>\nstream\n`), sealed, Buffer.from('\nendstream')]),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    encryptObject,
  ];
  const chunks = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let at = chunks[0].length;
  objects.forEach((o, i) => {
    offsets.push(at);
    const body = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), Buffer.isBuffer(o) ? o : Buffer.from(o), Buffer.from('\nendobj\n')]);
    chunks.push(body);
    at += body.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  chunks.push(
    Buffer.from(
      `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Encrypt 6 0 R /ID [${hex(id)} ${hex(id)}] >>\nstartxref\n${at}\n%%EOF\n`,
      'latin1',
    ),
  );
  return new Uint8Array(Buffer.concat(chunks));
}
