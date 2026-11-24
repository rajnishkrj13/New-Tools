/**
 * A small XML reader and writer for Tally files. It runs the same in the browser and in tests,
 * reports problems with line numbers instead of giving up, never fetches anything (no DTDs, no
 * external entities, so no XXE), and copes with what Tally itself writes: UTF-16 files and
 * character references to control codes such as &#4; that strict parsers reject.
 */

export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  /** Text directly inside the element (trimmed of surrounding whitespace). */
  text: string;
  line: number;
}

export interface XmlProblem {
  line: number;
  message: string;
}

export interface Parsed {
  root: XNode | null;
  problems: XmlProblem[];
}

/** Bytes of an uploaded file as text: UTF-8, or UTF-16 when Tally saved it that way. */
export function decodeXml(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  // UTF-16 without a byte-order mark: every other byte of "<ENVELOPE" is zero.
  if (bytes.length > 3 && bytes[1] === 0 && bytes[3] === 0 && bytes[0] !== 0) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes.length > 3 && bytes[0] === 0 && bytes[2] === 0 && bytes[1] !== 0) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function unescapeText(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      // Tally writes &#4; and similar as separators; they carry no text.
      if (!Number.isFinite(code) || code < 9 || (code > 13 && code < 32) || code > 0x10ffff) return '';
      return String.fromCodePoint(code);
    }
    return NAMED[e] ?? m;
  });
}

/** Escapes text for an XML element or attribute. Control characters XML cannot hold are dropped. */
export function esc(s: string | number): string {
  return String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Parses XML text into a tree. Problems are collected; the tree is built as far as possible. */
export function parseXml(src: string): Parsed {
  const problems: XmlProblem[] = [];
  const stack: XNode[] = [];
  let root: XNode | null = null;
  let i = 0;
  let line = 1;
  const n = src.length;
  const texts: string[][] = [];

  const countLines = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (src.charCodeAt(k) === 10) line++;
  };

  while (i < n) {
    const lt = src.indexOf('<', i);
    const end = lt === -1 ? n : lt;
    if (end > i) {
      const raw = src.slice(i, end);
      if (stack.length) texts[stack.length - 1].push(raw);
      else if (raw.trim()) problems.push({ line, message: 'Text outside the main element.' });
      countLines(i, end);
    }
    if (lt === -1) break;
    i = lt;
    if (src.startsWith('<!--', i)) {
      const close = src.indexOf('-->', i + 4);
      if (close === -1) {
        problems.push({ line, message: 'A comment is never closed.' });
        break;
      }
      countLines(i, close + 3);
      i = close + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', i)) {
      const close = src.indexOf(']]>', i + 9);
      if (close === -1) {
        problems.push({ line, message: 'A CDATA section is never closed.' });
        break;
      }
      // Kept raw: escape it so the later unescape gives it back unchanged.
      if (stack.length) texts[stack.length - 1].push(src.slice(i + 9, close).replace(/&/g, '&amp;'));
      countLines(i, close + 3);
      i = close + 3;
      continue;
    }
    if (src.startsWith('<?', i)) {
      const close = src.indexOf('?>', i + 2);
      if (close === -1) {
        problems.push({ line, message: 'An XML declaration is never closed.' });
        break;
      }
      countLines(i, close + 2);
      i = close + 2;
      continue;
    }
    if (src.startsWith('<!', i)) {
      // DOCTYPE and entity declarations are refused: Tally files never need them, and they are how
      // XML "entity expansion" and external-entity attacks work.
      problems.push({ line, message: 'DOCTYPE or entity declarations are not allowed in Tally XML; the declaration was ignored.' });
      const close = src.indexOf('>', i);
      let depth = 0;
      let k = i + 2;
      for (; k < n; k++) {
        const c = src[k];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      const stop = k < n ? k : close === -1 ? n - 1 : close;
      countLines(i, stop + 1);
      i = stop + 1;
      continue;
    }
    const gt = findTagEnd(src, i + 1);
    if (gt === -1) {
      problems.push({ line, message: 'A tag is never closed with ">".' });
      break;
    }
    const body = src.slice(i + 1, gt);
    const startLine = line;
    countLines(i, gt + 1);
    i = gt + 1;
    if (body[0] === '/') {
      const name = body.slice(1).trim();
      const top = stack[stack.length - 1];
      if (!top) {
        problems.push({ line: startLine, message: `Closing tag </${name}> has no opening tag.` });
        continue;
      }
      if (top.name !== name) {
        const at = stack.map((s) => s.name).lastIndexOf(name);
        if (at === -1) {
          problems.push({ line: startLine, message: `Closing tag </${name}> does not match <${top.name}> (line ${top.line}).` });
          continue;
        }
        // Close the elements left open in between, reporting each.
        while (stack.length - 1 > at) {
          const open = stack[stack.length - 1];
          problems.push({ line: startLine, message: `<${open.name}> (line ${open.line}) is never closed.` });
          finish();
        }
      }
      finish();
      continue;
    }
    const selfClose = body.endsWith('/');
    const inner = selfClose ? body.slice(0, -1) : body;
    const m = /^([^\s/>]+)/.exec(inner);
    if (!m || !/^[A-Za-z_:][\w.:-]*$/.test(m[1])) {
      problems.push({ line: startLine, message: `"<${inner.slice(0, 20)}" is not a valid tag.` });
      continue;
    }
    const node: XNode = { name: m[1], attrs: parseAttrs(inner.slice(m[1].length), startLine, problems), children: [], text: '', line: startLine };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else if (!root) root = node;
    else problems.push({ line: startLine, message: `A second top-level element <${node.name}>; an XML file has only one.` });
    if (!selfClose) {
      stack.push(node);
      texts.push([]);
    }
  }
  while (stack.length) {
    problems.push({ line, message: `<${stack[stack.length - 1].name}> (line ${stack[stack.length - 1].line}) is never closed.` });
    finish();
  }
  if (!root && !problems.length) problems.push({ line: 1, message: 'The file has no XML elements.' });
  return { root, problems };

  function finish() {
    const node = stack.pop()!;
    const t = texts.pop()!;
    node.text = unescapeText(t.join('')).trim();
  }
}

function findTagEnd(src: string, from: number): number {
  let quote = '';
  for (let k = from; k < src.length; k++) {
    const c = src[k];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return k;
    else if (c === '<') return -1;
  }
  return -1;
}

function parseAttrs(s: string, line: number, problems: XmlProblem[]): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let rest = s;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    attrs[m[1]] = unescapeText(m[3] ?? m[4] ?? '');
    rest = rest.replace(m[0], '');
  }
  if (rest.trim()) problems.push({ line, message: `Attribute text "${rest.trim().slice(0, 30)}" is not written as name="value".` });
  return attrs;
}

// ---- Tree helpers -------------------------------------------------------------------------------

/** First direct child with this tag name (case-insensitive, as Tally tag case varies by export). */
export function child(node: XNode | undefined, name: string): XNode | undefined {
  if (!node) return undefined;
  const up = name.toUpperCase();
  return node.children.find((c) => c.name.toUpperCase() === up);
}

export function children(node: XNode | undefined, name: string): XNode[] {
  if (!node) return [];
  const up = name.toUpperCase();
  return node.children.filter((c) => c.name.toUpperCase() === up);
}

/** Text of a direct child, '' when absent. */
export function val(node: XNode | undefined, name: string): string {
  return child(node, name)?.text ?? '';
}

/** Every element with this name anywhere below `node` (depth-first, document order). */
export function findAll(node: XNode | null | undefined, name: string, out: XNode[] = []): XNode[] {
  if (!node) return out;
  const up = name.toUpperCase();
  const walk = (x: XNode) => {
    for (const c of x.children) {
      if (c.name.toUpperCase() === up) out.push(c);
      else walk(c);
    }
  };
  if (node.name.toUpperCase() === up) out.push(node);
  else walk(node);
  return out;
}

/** Writes a tree back as indented XML. */
export function writeXml(node: XNode, indent = ''): string {
  const attrs = Object.entries(node.attrs)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
  if (!node.children.length) return node.text ? `${indent}<${node.name}${attrs}>${esc(node.text)}</${node.name}>` : `${indent}<${node.name}${attrs}/>`;
  const inner = node.children.map((c) => writeXml(c, `${indent} `)).join('\n');
  return `${indent}<${node.name}${attrs}>${node.text ? esc(node.text) : ''}\n${inner}\n${indent}</${node.name}>`;
}
