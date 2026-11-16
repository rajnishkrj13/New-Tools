/* eslint-disable -- ported verbatim from the GST Toolkit; kept identical so its tested behaviour does not change */
// @ts-nocheck -- ported verbatim from GST_Toolkit_V1.html ("gstcore"); its logic is kept exactly.
/**
 * GST core: reads GST portal GSTR-1 / GSTR-3B PDFs (text, not scanned), field catalogues,
 * checks, GSTR-1 vs GSTR-3B comparison lines and month-wise tables. Runs in the browser.
 */
import { openPdf } from '@/lib/pdf/render';

const GST: any = {};
  function r2(x) { return x == null ? null : Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100; }
  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  GST.r2 = r2;

  // ---------------------------------------------------------------- reference data
  GST.STATES = { '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '28': 'Andhra Pradesh (old)', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre Jurisdiction' };
  GST.state = function (gstin) { return GST.STATES[String(gstin || '').slice(0, 2)] || ''; };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  GST.MONTHS = MONTHS;
  GST.FY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  GST.monName = function (m) { return MONTHS[m - 1].slice(0, 3); };
  GST.HEADS = { rec: 'No. of records', v: 'Taxable value', i: 'IGST', c: 'CGST', s: 'SGST/UTGST', cs: 'Cess', inter: 'Inter-State', intra: 'Intra-State' };
  var GSTIN_RX = /\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/;
  GST.validGstin = function (g) {
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
    var cs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', sum = 0;
    for (var i = 0; i < 14; i++) { var p = cs.indexOf(g[i]) * (i % 2 ? 2 : 1); sum += Math.floor(p / 36) + (p % 36); }
    return cs[(36 - (sum % 36)) % 36] === g[14];
  };
  function periodInfo(text) {
    var t = norm(text), lt = t.toLowerCase(), found = [];
    MONTHS.forEach(function (m, i) { var k = lt.indexOf(m.toLowerCase().slice(0, 3)); if (k >= 0) found.push({ m: i + 1, at: k }); });
    found.sort(function (a, b) { return a.at - b.at; });
    if (!found.length) return { month: null, quarter: false, text: t };
    var last = found[found.length - 1].m;
    return { month: last, quarter: found.length > 1 || /quarter|q[1-4]\b/i.test(t), text: t };
  }
  GST.fyOf = function (fy, m) { var y = parseInt(fy, 10); return m >= 4 ? y : y + 1; };   // calendar year of month m in FY "2025-26"
  GST.fyIndex = function (m) { return (m + 8) % 12; };                                    // Apr = 0 … Mar = 11

  // ---------------------------------------------------------------- PDF → lines
  GST.readPdf = function (buf) {
    return openPdf(new Uint8Array(buf)).then(function (doc) {
      var pages = [], i = 0;
      function next() {
        i++;
        if (i > doc.numPages) { doc.destroy(); return pages; }
        return doc.getPage(i).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          pages.push(tc.items.filter(function (it) { return 'str' in it; }).map(function (it) { return { s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height, rot: Math.abs(it.transform[1]) > 0.01 || Math.abs(it.transform[2]) > 0.01 }; }));
          return next();
        });
      }
      return next();
    });
  };
  var NUMF = /^-?[\d,]*\d\.?\d*$/;
  GST.lines = function (pages) {
    var out = [];
    pages.forEach(function (items, pi) {
      var its = items.filter(function (t) { return t.s && t.s.trim() && !t.rot; }).map(function (t) { return { s: norm(t.s), x0: t.x, x1: t.x + (t.w || 0), y: t.y, h: t.h }; });
      its.sort(function (a, b) { return b.y - a.y || a.x0 - b.x0; });
      var L = [];
      its.forEach(function (t) { var c = L[L.length - 1]; if (c && Math.abs(c.y - t.y) <= 1.5) c.t.push(t); else L.push({ y: t.y, t: [t], page: pi + 1 }); });
      L.forEach(function (l) { l.t.sort(function (a, b) { return a.x0 - b.x0; }); });
      // a number split over two lines ("1356902." + "00", "476146.0" + "0"): join the fragment to the number above
      for (var k = 0; k < L.length - 1; k++) {
        var a = L[k], b = L[k + 1];
        if (a.y - b.y > 14) continue;
        b.t = b.t.filter(function (f) {
          if (!/^\d{1,2}$/.test(f.s)) return true;
          var up = a.t.filter(function (u) { return Math.abs(u.x1 - f.x1) < 2 && /^-?[\d,]+\.\d?$/.test(u.s); })[0];
          if (!up) return true;
          up.s += f.s; return false;
        });
      }
      L.forEach(function (l) { if (l.t.length) { l.text = l.t.map(function (t) { return t.s; }).join(' '); out.push(l); } });
    });
    return out;
  };
  function num(s) {
    if (s == null || s === '-' || s === '') return null;
    var t = String(s).replace(/,/g, ''), neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    var n = parseFloat(t);
    return isFinite(n) ? (neg ? -n : n) : null;
  }
  GST.num = num;
  GST.detect = function (lines) {
    var head = lines.slice(0, 12).map(function (l) { return l.text; }).join(' ').toUpperCase();
    if (/GSTR-?3B/.test(head)) return 'GSTR3B';
    if (/GSTR-?1\b/.test(head)) return 'GSTR1';
    return null;
  };

  // ---------------------------------------------------------------- GSTR-1
  var G1SEC = [
    [/^4A$/, 'B2B'], [/^4B$/, 'B2BRC'], [/^5$/, 'B2CL'], [/^6A$/, 'EXP'], [/^6B$/, 'SEZ'], [/^6C$/, 'DE'], [/^7$/, 'B2CS'], [/^8$/, 'NIL'],
    [/^10$/, 'B2CSA'], [/^11A\(1\)/, 'AT'], [/^11B\(1\)/, 'ATADJ'], [/^11A$/, 'ATA'], [/^11B$/, 'ATADJA'], [/^12$/, 'HSN'], [/^13$/, 'DOC'],
    [/^14$/, 'ECO'], [/^14A$/, 'ECOA'], [/^15$/, 'SUP95'], [/^15A ?\(I\)$/, 'SUP95AR'], [/^15A ?\(II\)$/, 'SUP95AU']
  ];
  function g1SecId(code, title) {
    if (code === '9A') {
      if (/reverse charge/i.test(title)) return 'B2BARC';
      if (/B2B Regular/i.test(title)) return 'B2BA';
      if (/B2CL|unregistered person/i.test(title)) return 'B2CLA';
      if (/export/i.test(title)) return 'EXPA';
      if (/SEZ/i.test(title)) return 'SEZA';
      if (/deemed/i.test(title)) return 'DEA';
      return '9A';
    }
    if (code === '9B') return /unregistered|CDNUR/i.test(title) ? 'CDNUR' : 'CDNR';
    if (code === '9C') return /unregistered|CDNURA/i.test(title) ? 'CDNURA' : 'CDNRA';
    for (var i = 0; i < G1SEC.length; i++) if (G1SEC[i][0].test(code)) return G1SEC[i][1];
    return 'T' + code;
  }
  function subTag(sub) {
    if (/reverse charge/i.test(sub)) return 'RC';
    if (/B2B Regular|table 4 other than table 6 - B2B Regular/i.test(sub)) return 'B2B';
    if (/SEZ/i.test(sub)) return 'SEZ';
    if (/6C|\bDE\b/.test(sub)) return 'DE';
    if (/u\/s 52|\(a\)/i.test(sub)) return 'TCS';
    if (/9\(5\)|\(b\)/i.test(sub)) return '95';
    return '';
  }
  function g1Field(sec, label, sub, curSub) {
    var l = label.replace(/[–—]/g, '-').replace(/\s+/g, ' ').replace(/Non- ?GST/i, 'Non-GST').replace(/^-(?=\S)/, '- ');
    if (/^Total Liability/i.test(l)) return 'TL';
    var amt = /^Amended amount\b/i.test(l), diff = /^Net differential amount/i.test(l);
    var dash = l.match(/^- ?(EXPWP|EXPWOP|SEZWP|SEZWOP|B2CL|Nil|Exempted|Non-GST|Regular|DE|For Registered Recipients?|For Unregistered Recipients?)$/i);
    switch (sec) {
      case 'NIL': if (/^Total$/.test(l)) return 'NIL_TOT'; if (dash) return { nil: 'NIL', exempted: 'EXEMPT', 'non-gst': 'NONGST' }[dash[1].toLowerCase()]; break;
      case 'EXP': case 'SEZ': if (/^Total$/.test(l)) return sec; if (dash) return dash[1].toUpperCase(); break;
      case 'CDNR': case 'CDNRA':
        if (/^Total - Net off/i.test(l)) return sec;
        if (amt) return sec + '_AMT';
        if (/^Net Differential amount/i.test(l)) return sec;
        if (/^Net total/i.test(l)) return sec + '_' + (subTag(curSub) || 'X');
        break;
      case 'CDNUR': case 'CDNURA':
        if (/^Total - Net off/i.test(l)) return sec;
        if (amt) return sec + '_AMT';
        if (/^Net Differential amount/i.test(l)) return sec;
        if (dash) return sec + '_' + dash[1].toUpperCase();
        break;
      case 'HSN': if (/^Total$/.test(l)) return 'HSN'; if (/^B2B Total/i.test(l)) return 'HSN_B2B'; if (/^B2C Total/i.test(l)) return 'HSN_B2C'; break;
      case 'DOC': if (/net issued/i.test(l)) return 'DOC'; break;
      case 'ECO': if (/^Total$/.test(l)) return 'ECO'; if (/^\(a\)/.test(l)) return 'ECO_TCS'; if (/^\(b\)/.test(l)) return 'ECO_95'; break;
      case 'ECOA': { var tg = subTag(curSub); var base = tg ? 'ECOA_' + tg : 'ECOA'; if (amt) return base + '_AMT'; if (diff) return base; break; }
      case 'SUP95': if (/^Total$/.test(l)) return 'SUP95'; if (dash) { var d = dash[1].toLowerCase(); if (/registered recipients?$/.test(d) && !/unreg/.test(d)) return 'SUP95_REG'; if (/unregistered/.test(d)) return 'SUP95_UNREG'; return 'SUP95_REG_' + dash[1].toUpperCase(); } break;
      case 'SUP95AR': case 'SUP95AU': if (amt) return sec + '_AMT'; if (diff) return sec; if (dash) return sec + '_' + dash[1].toUpperCase(); break;
      case 'ATA': case 'ATADJA': if (amt) return sec + '_AMT'; if (/^Total$/.test(l)) return sec; break;
      default:
        if (/^Total$/.test(l)) return sec;
        if (amt) return sec + '_AMT';
        if (diff) return sec + (/- Total$/.test(l) ? '' : '');
        if (dash) return sec + '_' + dash[1].toUpperCase();
    }
    return null;
  }
  function phrases(tokens, gap) {
    var out = [];
    tokens.forEach(function (t) { var p = out[out.length - 1]; if (p && t.x0 - p.x1 < gap) { p.s += ' ' + t.s; p.x1 = t.x1; } else out.push({ s: t.s, x0: t.x0, x1: t.x1 }); });
    return out;
  }
  GST.parseGSTR1 = function (lines) {
    var R = { type: 'GSTR1', rows: [], f: {}, warn: [], checks: [] };
    var hdrLine = null;
    for (var i = 0; i < lines.length; i++) if (/^Description\b/.test(lines[i].text) || /\bDescription Value\b/.test(lines[i].text)) { hdrLine = lines[i]; break; }
    // header fields
    lines.slice(0, 30).forEach(function (l) {
      var t = l.text, m;
      if (!R.fy && (m = t.match(/Financial year\s+(\d{4}-\d{2,4})/i))) R.fy = m[1].slice(0, 7);
      if (!R.periodText && (m = t.match(/Tax period\s+(.+)$/i))) R.periodText = m[1];
      if (!R.gstin && /GSTIN/i.test(t) && (m = t.match(GSTIN_RX))) R.gstin = m[0];
      if (!R.legal && (m = t.match(/Legal name of the registered person\s+(.+)$/i))) R.legal = m[1];
      if (!R.trade && (m = t.match(/Trade name(?:,)? if any\s+(.+)$/i))) R.trade = m[1];
      if (!R.arnDate && (m = t.match(/ARN date\s+(\S+)/i))) R.arnDate = m[1];
      else if (!R.arn && (m = t.match(/\bARN\s+([A-Z]{2}\d{6,}[A-Z0-9]*)/))) R.arn = m[1];
    });
    if (!hdrLine) { R.error = 'Could not find the GSTR-1 table headings.'; return R; }
    var ph = phrases(hdrLine.t, 8), A = {};
    ph.forEach(function (p) {
      if (/^Value/i.test(p.s)) A.v = p.x1; else if (/^Integrated/i.test(p.s)) A.i = p.x1; else if (/^Central/i.test(p.s)) A.c = p.x1;
      else if (/^State/i.test(p.s)) A.s = p.x1; else if (/^Cess/i.test(p.s)) A.cs = p.x1; else if (/^Description/i.test(p.s)) A.desc = p.x0;
    });
    var recLine = lines.filter(function (l) { return /^No\. of\b/.test(l.text); })[0];
    var docX = recLine ? (recLine.t.filter(function (t) { return /^Document/.test(t.s); })[0] || {}).x0 : null;
    var recX = recLine ? recLine.t[0].x0 : null;
    if (A.v == null || A.i == null) { R.error = 'Could not read the GSTR-1 column positions.'; return R; }
    if (docX == null) docX = A.v - 90;
    if (recX == null) recX = docX - 70;
    var heads = ['v', 'i', 'c', 's', 'cs'].filter(function (h) { return A[h] != null; });
    var AMT = /^-?[\d,]+\.\d{2}$/;
    var sec = null, secCode = '', secTitle = '', sub = '', last = null, started = false;
    lines.forEach(function (l) {
      var t = l.text;
      if (l === hdrLine || /^(No\. of|Description|records\b)/.test(t) || /IP Address/i.test(t) || /^Verification/i.test(t)) return;
      var amts = [], rec = null, doc = [], lab = [];
      l.t.forEach(function (tk) {
        if (AMT.test(tk.s) && tk.x1 > docX + 20) amts.push(tk);
        else if (/^\d+$/.test(tk.s) && tk.x0 >= recX - 25 && tk.x1 <= docX + 2) rec = +tk.s;
        else if (tk.x0 >= docX - 8 && tk.x1 < A.v - 25) doc.push(tk.s);
        else lab.push(tk.s);
      });
      var label = (!amts.length && rec == null) ? norm(t) : norm(lab.join(' '));
      var mcode = label.match(/^(\d{1,2}[A-C]?(?: ?\((?:\d|I{1,3})\))?(?:, ?\d{1,2}[A-C]?\(\d\))?)\s*[-–]/);
      if (!amts.length && rec == null && mcode && !/^(Amended|Net|Total)/i.test(label)) {
        secCode = mcode[1].replace(/\s+/g, ' '); secTitle = label; sec = g1SecId(secCode.replace(/,.*$/, '').replace(/ \(/, ' ('), label);
        if (/^11A\(1\)/.test(secCode)) sec = 'AT'; if (/^11B\(1\)/.test(secCode)) sec = 'ATADJ';
        sub = ''; last = null; started = true; return;
      }
      if (!started) return;
      if (!amts.length && rec == null) {
        if (last && (last.label.split('(').length > last.label.split(')').length)) { last.label = norm(last.label + ' ' + label); last.field = g1Field(sec, last.label, '', sub) || last.field; if (last.field) R.f[last.field] = last; return; }
        if (label.split(' ').length >= 2 || /^\(?[a-z]\)/i.test(label)) sub = label;
        return;
      }
      var row = { sec: sec, code: secCode, title: secTitle, sub: sub, label: label, rec: rec, doc: norm(doc.join(' ')), page: l.page };
      amts.forEach(function (tk) {
        var best = null, bd = 1e9;
        heads.forEach(function (h) { var d = Math.abs(tk.x1 - A[h]) + (tk.x1 < A[h] - 60 ? 50 : 0); if (d < bd) { bd = d; best = h; } });
        // amounts are right-aligned a little right of the heading's end
        if (best) row[best] = num(tk.s);
      });
      row.field = g1Field(/^Total Liability/i.test(label) ? 'TL' : sec, label, '', sub);
      R.rows.push(row); last = row;
      if (row.field && !R.f[row.field]) R.f[row.field] = row;
    });
    var pi = periodInfo(R.periodText || '');
    R.month = pi.month; R.quarter = pi.quarter;
    R.state = GST.state(R.gstin);
    if (!R.gstin) R.warn.push('GSTIN not found in the PDF.');
    if (!R.month) R.warn.push('Tax period not recognised: ' + (R.periodText || '(blank)'));
    G1check(R);
    return R;
  };
  // Total liability worked out from the tables must equal the "Total Liability" line printed in the return
  var TL_PLUS = ['B2B', 'B2CL', 'EXP', 'SEZ', 'DE', 'B2CS', 'B2BA', 'B2CLA', 'EXPA', 'SEZA', 'DEA', 'CDNR', 'CDNUR', 'CDNRA', 'CDNURA', 'B2CSA', 'AT', 'ATA', 'SUP95', 'SUP95AR', 'SUP95AU'];
  var TL_MINUS = ['ATADJ', 'ATADJA', 'CDNR_RC', 'CDNRA_RC'];
  var TL_VALUE_ONLY = ['NIL_TOT', 'ECO_95', 'ECOA_95'];
  GST.g1Computed = function (f) {
    var o = { v: 0, i: 0, c: 0, s: 0, cs: 0 };
    var add = function (k, sg, valOnly) { var x = f[k]; if (!x) return; ['v', 'i', 'c', 's', 'cs'].forEach(function (h) { if (valOnly && h !== 'v') return; if (x[h] != null) o[h] += sg * x[h]; }); };
    TL_PLUS.forEach(function (k) { add(k, 1); }); TL_MINUS.forEach(function (k) { add(k, -1); }); TL_VALUE_ONLY.forEach(function (k) { add(k, 1, true); });
    ['v', 'i', 'c', 's', 'cs'].forEach(function (h) { o[h] = r2(o[h]); });
    return o;
  };
  function G1check(R) {
    var tl = R.f.TL;
    if (!tl) { R.checks.push({ lvl: 'warn', msg: 'Total Liability line not found, so the return could not be cross-checked.' }); return; }
    var c = GST.g1Computed(R.f), bad = [];
    ['v', 'i', 'c', 's', 'cs'].forEach(function (h) { var d = r2((tl[h] || 0) - c[h]); if (Math.abs(d) > 0.05) bad.push(GST.HEADS[h] + ' ' + d.toFixed(2)); });
    R.tlDiff = bad;
    if (!bad.length) R.checks.push({ lvl: 'ok', msg: 'Tables add up to the Total Liability printed in the return.' });
    else R.checks.push({ lvl: 'warn', msg: 'Tables do not add up to the printed Total Liability (' + bad.join(', ') + '). Check the return for sections this tool does not total.' });
    if (R.f.HSN && tl) {
      var hd = ['v', 'i', 'c', 's'].filter(function (h) { return Math.abs((R.f.HSN[h] || 0) - (tl[h] || 0)) > 1; });
      R.checks.push(hd.length ? { lvl: 'warn', msg: 'HSN summary (Table 12) differs from total liability in ' + hd.map(function (h) { return GST.HEADS[h]; }).join(', ') + '.' } : { lvl: 'ok', msg: 'HSN summary (Table 12) agrees with total liability.' });
    }
  }

  // ---------------------------------------------------------------- GSTR-3B
  GST.parseGSTR3B = function (lines) {
    var R = { type: 'GSTR3B', f: {}, rows: [], brk: [], warn: [], checks: [] };
    lines.slice(0, 20).forEach(function (l) {
      var t = l.text, m;
      if (!R.fy && (m = t.match(/^Year\s+(\d{4}-\d{2,4})/i))) R.fy = m[1].slice(0, 7);
      if (!R.periodText && (m = t.match(/^Period\s+(.+)$/i))) R.periodText = m[1];
      if (!R.gstin && /GSTIN/i.test(t) && (m = t.match(GSTIN_RX))) R.gstin = m[0];
      if (!R.legal && (m = t.match(/Legal name of the registered person\s+(.+)$/i))) R.legal = m[1];
      if (!R.trade && (m = t.match(/Trade name,? if any\s+(.+)$/i))) R.trade = m[1];
      if (!R.arnDate && (m = t.match(/Date of ARN\s+(\S+)/i))) R.arnDate = m[1];
      else if (!R.arn && (m = t.match(/\bARN\s+([A-Z]{2}\d{6,}[A-Z0-9]*)/))) R.arn = m[1];
    });
    var sec = null, thr = 999, sub = '', expect = 0;
    var VAL = /^(-|-?[\d,]*\d\.?\d*)$/;
    lines.forEach(function (l) {
      var t = l.text;
      var s = null;
      if (/^3\.1 Details of Outward/i.test(t)) s = '3.1';
      else if (/^3\.1\.1\b/.test(t)) s = '3.1.1';
      else if (/^3\.2\b/.test(t)) s = '3.2';
      else if (/^4\.? Eligible ITC/i.test(t)) s = '4';
      else if (/^5\.1\b/.test(t)) s = '5.1';
      else if (/^5\.? Values? of exempt/i.test(t)) s = '5';
      else if (/^6\.1\b/.test(t)) s = '6.1';
      else if (/^Breakup of tax liability/i.test(t)) s = 'BRK';
      else if (/^Verification/i.test(t)) s = 'END';
      if (s) { sec = s; thr = 999; sub = ''; expect = { '3.1': 5, '3.1.1': 5, '3.2': 2, '4': 4, '5': 2, '5.1': 4, '6.1': 10, 'BRK': 4 }[s] || 0; return; }
      if (!sec || sec === 'END') return;
      if (/^(Nature|Details|Descripti|Description|Period)\b/.test(t) && thr === 999) {
        for (var k = 1; k < l.t.length; k++) if (l.t[k].x0 - l.t[k - 1].x1 > 8) { thr = l.t[k].x0 - 4; break; }
        return;
      }
      if (thr === 999) return;
      var vals = l.t.filter(function (tk) { return tk.x0 >= thr && VAL.test(tk.s); });
      var label = norm(l.t.filter(function (tk) { return tk.x1 < thr; }).map(function (tk) { return tk.s; }).join(' '));
      if (sec === '4') { if (/^A\./.test(label)) sub = 'A'; else if (/^B\./.test(label)) sub = 'B'; else if (/^\(?D\)?\.?/.test(label) && /^(\(D\)|D\.)/.test(label)) sub = 'D'; }
      if (sec === '6.1') { if (/^\(A\)/.test(label)) { sub = 'A'; return; } if (/^\(B\)/.test(label)) { sub = 'B'; return; } }
      if (!vals.length) return;
      var v = vals.map(function (tk) { return num(tk.s); });
      var key = null, cols = null;
      if (sec === '3.1') { var m1 = label.match(/^\(([a-e]) ?\)/); if (m1) key = '3.1' + m1[1]; cols = ['v', 'i', 'c', 's', 'cs']; }
      else if (sec === '3.1.1') { if (/^\(i\)/.test(label)) key = '3.1.1i'; else if (/^\(ii\)/.test(label)) key = '3.1.1ii'; cols = ['v', 'i', 'c', 's', 'cs']; }
      else if (sec === '3.2') { if (/unregistered/i.test(label)) key = '3.2UR'; else if (/composition/i.test(label)) key = '3.2COMP'; else if (/UIN/i.test(label)) key = '3.2UIN'; cols = ['v', 'i']; }
      else if (sec === '4') {
        cols = ['i', 'c', 's', 'cs'];
        var m4 = label.match(/^\((\d)\)/);
        if (m4) key = '4' + sub + m4[1];
        else if (/^C\./.test(label)) key = '4C';
        else if (/^(\(D\)|D\.)/.test(label)) key = '4D';
      } else if (sec === '5') { cols = ['inter', 'intra']; if (/non ?-?GST/i.test(label)) key = '5.NONGST'; else if (/composition|exempt|nil/i.test(label)) key = '5.EXEMPT'; }
      else if (sec === '5.1') { cols = ['i', 'c', 's', 'cs']; if (/^System computed/i.test(label)) key = '5.1SYS'; else if (/^Interest/i.test(label)) key = '5.1INT'; else if (/^Late fee/i.test(label)) key = '5.1LATE'; }
      else if (sec === '6.1') {
        var hd = /^Integrated/i.test(label) ? 'i' : /^Central/i.test(label) ? 'c' : /^State/i.test(label) ? 's' : /^Cess/i.test(label) ? 'cs' : null;
        if (hd && sub) {
          var meas = v.length >= 10 ? ['payable', 'adj', 'net', 'itc_i', 'itc_c', 'itc_s', 'itc_cs', 'cash', 'int', 'late'] : ['payable', 'itc_i', 'itc_c', 'itc_s', 'itc_cs', 'cash', 'int', 'late'];
          if (v.length !== meas.length) R.warn.push('6.1 ' + sub + ' ' + label + ': ' + v.length + ' figures found, expected ' + meas.length + '.');
          meas.forEach(function (ms, j) { var k2 = '6.1' + sub + '.' + ms; R.f[k2] = R.f[k2] || {}; R.f[k2][hd] = v[j] == null ? null : v[j]; });
          R.rows.push({ sec: '6.1', key: '6.1' + sub + ':' + hd, label: label, vals: v });
        }
        return;
      } else if (sec === 'BRK') {
        var p = periodInfo(label);
        R.brk.push({ period: label, month: p.month, i: v[0], c: v[1], s: v[2], cs: v[3] });
        return;
      }
      R.rows.push({ sec: sec, key: key, label: label, vals: v });
      if (!key || !cols) return;
      if (v.length !== cols.length) R.warn.push(key + ': ' + v.length + ' figures found, expected ' + cols.length + '.');
      var o = {};
      cols.forEach(function (c, j) { o[c] = v[j] == null ? null : v[j]; });
      if (!R.f[key]) R.f[key] = o;
    });
    // computed totals
    var sumOf = function (keys) { var o = { i: 0, c: 0, s: 0, cs: 0 }; keys.forEach(function (k) { var x = R.f[k]; if (x) ['i', 'c', 's', 'cs'].forEach(function (h) { o[h] = r2(o[h] + (x[h] || 0)); }); }); return o; };
    R.f['4A'] = sumOf(['4A1', '4A2', '4A3', '4A4', '4A5']);
    R.f['4B'] = sumOf(['4B1', '4B2']);
    ['A', 'B'].forEach(function (sb) {
      if (!R.f['6.1' + sb + '.payable']) return;
      var o = {};
      ['i', 'c', 's', 'cs'].forEach(function (h) { o[h] = r2(['itc_i', 'itc_c', 'itc_s', 'itc_cs'].reduce(function (t, ms) { return t + ((R.f['6.1' + sb + '.' + ms] || {})[h] || 0); }, 0)); });
      R.f['6.1' + sb + '.itc'] = o;
    });
    var pi = periodInfo(R.periodText || '');
    R.month = pi.month; R.quarter = pi.quarter; R.state = GST.state(R.gstin);
    if (!R.gstin) R.warn.push('GSTIN not found in the PDF.');
    if (!R.month) R.warn.push('Tax period not recognised: ' + (R.periodText || '(blank)'));
    G3check(R);
    return R;
  };
  function G3check(R) {
    var f = R.f, H = ['i', 'c', 's', 'cs'], g = function (k, h) { return (f[k] || {})[h] || 0; };
    if (!f['3.1a']) { R.checks.push({ lvl: 'err', msg: 'Table 3.1 was not found.' }); return; }
    var bad = H.filter(function (h) { return f['4C'] && Math.abs(g('4A', h) - g('4B', h) - g('4C', h)) > 1; });
    R.checks.push(f['4C'] ? (bad.length ? { lvl: 'warn', msg: 'Net ITC 4C is not 4A − 4B for ' + bad.map(function (h) { return GST.HEADS[h]; }).join(', ') + '.' } : { lvl: 'ok', msg: 'ITC: 4A − 4B = 4C.' }) : { lvl: 'warn', msg: 'Table 4 (ITC) was not found.' });
    if (f['6.1A.payable']) {
      var b2 = H.filter(function (h) { return Math.abs(Math.round(g('3.1a', h) + g('3.1b', h)) - g('6.1A.payable', h)) > 1.01; });
      R.checks.push(b2.length ? { lvl: 'warn', msg: 'Tax payable in 6.1(A) differs from 3.1(a)+(b) for ' + b2.map(function (h) { return GST.HEADS[h]; }).join(', ') + '.' } : { lvl: 'ok', msg: 'Tax payable in 6.1 agrees with Table 3.1.' });
      var net = f['6.1A.net'] ? '6.1A.net' : '6.1A.payable';
      var b3 = H.filter(function (h) { return Math.abs(g('6.1A.itc', h) + g('6.1A.cash', h) - g(net, h)) > 1.01; });
      R.checks.push(b3.length ? { lvl: 'warn', msg: 'In 6.1(A), ITC used + cash paid ≠ net tax payable for ' + b3.map(function (h) { return GST.HEADS[h]; }).join(', ') + '.' } : { lvl: 'ok', msg: 'Tax paid (ITC + cash) = tax payable.' });
    } else R.checks.push({ lvl: 'warn', msg: 'Table 6.1 (payment of tax) was not found.' });
  }

  GST.parse = function (lines) {
    var t = GST.detect(lines);
    if (t === 'GSTR1') return GST.parseGSTR1(lines);
    if (t === 'GSTR3B') return GST.parseGSTR3B(lines);
    return { error: 'This PDF is not a GSTR-1 or GSTR-3B return from the GST portal.' };
  };
  GST.readFile = function (file) {
    return file.arrayBuffer().then(GST.readPdf).then(function (pages) {
      var n = pages.reduce(function (t, p) { return t + p.length; }, 0);
      if (n < 20) return { error: 'This PDF has no readable text (it looks scanned). Download the return PDF again from the GST portal.' };
      var r = GST.parse(GST.lines(pages));
      r.file = file.name; r.size = file.size;
      if (!r.error && r.gstin && r.fy && r.month) r.key = r.type + '|' + r.gstin + '|' + r.fy + '|' + r.month;
      return r;
    }, function (e) { return { error: e && e.name === 'PasswordException' ? 'This PDF is password protected.' : 'Could not read this PDF: ' + (e && e.message ? e.message : e), file: file.name }; });
  };

  // ---------------------------------------------------------------- field catalogues (rows of the Excel / screen layouts)
  var ALL5 = ['v', 'i', 'c', 's', 'cs'], R6 = ['rec', 'v', 'i', 'c', 's', 'cs'], IG = ['rec', 'v', 'i', 'cs'], TX4 = ['i', 'c', 's', 'cs'];
  GST.G1_FIELDS = [
    ['B2B', '4A', 'B2B – regular supplies to registered persons', R6, 1], ['B2BRC', '4B', 'B2B – supplies attracting reverse charge', R6, 1],
    ['B2CL', '5', 'B2CL – inter-state to unregistered (invoice > ₹1 lakh)', IG, 1],
    ['EXP', '6A', 'Exports – total', IG, 1], ['EXPWP', '6A', '   Exports with payment of tax', IG], ['EXPWOP', '6A', '   Exports without payment of tax', ['rec', 'v']],
    ['SEZ', '6B', 'SEZ supplies – total', IG, 1], ['SEZWP', '6B', '   SEZ with payment of tax', IG], ['SEZWOP', '6B', '   SEZ without payment of tax', ['rec', 'v']],
    ['DE', '6C', 'Deemed exports', R6, 1],
    ['B2CS', '7', 'B2CS – others (net of credit/debit notes)', R6, 1],
    ['NIL_TOT', '8', 'Nil rated, exempted and non-GST – total', ['v'], 1], ['NIL', '8', '   Nil rated', ['v']], ['EXEMPT', '8', '   Exempted', ['v']], ['NONGST', '8', '   Non-GST', ['v']],
    ['B2BA', '9A', 'Amendments – B2B regular (net differential)', ALL5, 1], ['B2BARC', '9A', 'Amendments – B2B reverse charge (net differential)', ALL5], ['B2CLA', '9A', 'Amendments – B2CL (net differential)', ['v', 'i', 'cs']],
    ['EXPA', '9A', 'Amendments – exports (net differential)', ['v', 'i', 'cs']], ['SEZA', '9A', 'Amendments – SEZ (net differential)', ['v', 'i', 'cs']], ['DEA', '9A', 'Amendments – deemed exports (net differential)', ALL5],
    ['CDNR', '9B', 'Credit/debit notes – registered (net)', R6, 1], ['CDNR_B2B', '9B', '   B2B regular', R6], ['CDNR_RC', '9B', '   B2B reverse charge', R6], ['CDNR_SEZ', '9B', '   SEZ', IG], ['CDNR_DE', '9B', '   Deemed exports', R6],
    ['CDNUR', '9B', 'Credit/debit notes – unregistered (net)', IG, 1], ['CDNUR_B2CL', '9B', '   B2CL', IG], ['CDNUR_EXPWP', '9B', '   Exports with payment', IG], ['CDNUR_EXPWOP', '9B', '   Exports without payment', ['rec', 'v']],
    ['CDNRA', '9C', 'Amended credit/debit notes – registered (net differential)', ALL5, 1], ['CDNRA_B2B', '9C', '   B2B regular', R6], ['CDNRA_RC', '9C', '   B2B reverse charge', R6], ['CDNRA_SEZ', '9C', '   SEZ', IG], ['CDNRA_DE', '9C', '   Deemed exports', R6],
    ['CDNURA', '9C', 'Amended credit/debit notes – unregistered (net differential)', ['v', 'i', 'cs']],
    ['B2CSA', '10', 'Amendments – B2CS (net differential)', ALL5],
    ['AT', '11A', 'Advances received (tax added to liability)', R6], ['ATADJ', '11B', 'Advances adjusted against supplies', R6], ['ATA', '11A', 'Amendment – advances received (net)', ALL5], ['ATADJA', '11B', 'Amendment – advances adjusted (net)', ALL5],
    ['HSN', '12', 'HSN summary – total', R6, 1], ['HSN_B2B', '12', '   HSN – B2B', R6], ['HSN_B2C', '12', '   HSN – B2C', R6],
    ['DOC', '13', 'Documents issued (net)', ['rec'], 1],
    ['ECO', '14', 'Supplies through e-commerce operators – total', R6], ['ECO_TCS', '14', '   (a) ECO collects TCS u/s 52', R6], ['ECO_95', '14', '   (b) ECO pays tax u/s 9(5)', R6],
    ['ECOA_TCS', '14A', 'Amendment – ECO TCS (net differential)', ALL5], ['ECOA_95', '14A', 'Amendment – ECO 9(5) (net differential)', ALL5],
    ['SUP95', '15', 'Supplies u/s 9(5) reported by ECO – total', R6], ['SUP95_REG', '15', '   To registered recipients', R6], ['SUP95_UNREG', '15', '   To unregistered recipients', R6],
    ['SUP95AR', '15A', 'Amendment – 9(5) registered (net differential)', ALL5], ['SUP95AU', '15A', 'Amendment – 9(5) unregistered (net differential)', ALL5],
    ['TL', '', 'Total liability (outward supplies other than reverse charge)', ALL5, 1]
  ].map(function (a) { return { key: a[0], tbl: a[1], label: a[2], heads: a[3], keep: !!a[4] }; });
  GST.G3_FIELDS = [
    ['3.1a', '3.1(a)', 'Outward taxable supplies (other than zero rated, nil rated, exempted)', ALL5, 1], ['3.1b', '3.1(b)', 'Outward taxable supplies (zero rated)', ['v', 'i', 'cs'], 1],
    ['3.1c', '3.1(c)', 'Other outward supplies (nil rated, exempted)', ['v'], 1], ['3.1d', '3.1(d)', 'Inward supplies liable to reverse charge', ALL5, 1], ['3.1e', '3.1(e)', 'Non-GST outward supplies', ['v'], 1],
    ['3.1.1i', '3.1.1(i)', 'Supplies on which ECO pays tax u/s 9(5) (filed by ECO)', ALL5], ['3.1.1ii', '3.1.1(ii)', 'Supplies made through ECO u/s 9(5) (filed by supplier)', ['v'], 1],
    ['3.2UR', '3.2', 'Inter-state supplies to unregistered persons', ['v', 'i'], 1], ['3.2COMP', '3.2', 'Inter-state supplies to composition taxpayers', ['v', 'i']], ['3.2UIN', '3.2', 'Inter-state supplies to UIN holders', ['v', 'i']],
    ['4A1', '4A(1)', 'ITC – import of goods', TX4], ['4A2', '4A(2)', 'ITC – import of services', TX4], ['4A3', '4A(3)', 'ITC – inward supplies liable to reverse charge', TX4, 1], ['4A4', '4A(4)', 'ITC – inward supplies from ISD', TX4], ['4A5', '4A(5)', 'ITC – all other ITC', TX4, 1],
    ['4A', '4A', 'ITC available – total (worked out)', TX4, 1], ['4B1', '4B(1)', 'ITC reversed – rules 38, 42, 43 and sec 17(5)', TX4, 1], ['4B2', '4B(2)', 'ITC reversed – others', TX4], ['4B', '4B', 'ITC reversed – total (worked out)', TX4, 1],
    ['4C', '4C', 'Net ITC available (A − B)', TX4, 1], ['4D1', '4D(1)', 'ITC reclaimed (reversed under 4B(2) earlier)', TX4], ['4D2', '4D(2)', 'Ineligible ITC – sec 16(4) and PoS rules', TX4],
    ['5.EXEMPT', '5', 'Inward – composition, exempt and nil rated', ['inter', 'intra']], ['5.NONGST', '5', 'Inward – non-GST', ['inter', 'intra']],
    ['5.1SYS', '5.1', 'Interest – system computed', TX4], ['5.1INT', '5.1', 'Interest paid', TX4], ['5.1LATE', '5.1', 'Late fee', TX4],
    ['6.1A.payable', '6.1(A)', 'Tax payable – other than reverse charge', TX4, 1], ['6.1A.adj', '6.1(A)', 'Adjustment of negative liability', TX4], ['6.1A.net', '6.1(A)', 'Net tax payable', TX4],
    ['6.1A.itc_i', '6.1(A)', 'Paid through ITC – IGST', TX4], ['6.1A.itc_c', '6.1(A)', 'Paid through ITC – CGST', TX4], ['6.1A.itc_s', '6.1(A)', 'Paid through ITC – SGST/UTGST', TX4], ['6.1A.itc_cs', '6.1(A)', 'Paid through ITC – Cess', TX4],
    ['6.1A.itc', '6.1(A)', 'Paid through ITC – total (worked out)', TX4, 1], ['6.1A.cash', '6.1(A)', 'Tax paid in cash', TX4, 1], ['6.1A.int', '6.1(A)', 'Interest paid in cash', TX4], ['6.1A.late', '6.1(A)', 'Late fee paid in cash', TX4],
    ['6.1B.payable', '6.1(B)', 'Tax payable – reverse charge and 9(5)', TX4, 1], ['6.1B.cash', '6.1(B)', 'Tax paid in cash – reverse charge and 9(5)', TX4, 1]
  ].map(function (a) { return { key: a[0], tbl: a[1], label: a[2], heads: a[3], keep: !!a[4] }; });

  // ---------------------------------------------------------------- GSTR-1 vs GSTR-3B comparison lines
  GST.RECON = [
    { id: 'A', title: 'Taxable outward supplies', sub: '3.1(a) vs GSTR-1 B2B + B2CL + B2CS + deemed exports, with credit/debit notes, amendments and advances', heads: ALL5,
      b3: [['3.1a', 1]], g1: [['B2B', 1], ['B2CL', 1], ['DE', 1], ['B2CS', 1], ['CDNR_B2B', 1], ['CDNR_DE', 1], ['CDNUR_B2CL', 1], ['B2BA', 1], ['B2CLA', 1], ['DEA', 1], ['CDNRA_B2B', 1], ['CDNRA_DE', 1], ['CDNURA_B2CL', 1], ['B2CSA', 1], ['AT', 1], ['ATADJ', -1], ['ATA', 1], ['ATADJA', -1]] },
    { id: 'B', title: 'Zero-rated supplies (exports, SEZ)', sub: '3.1(b) vs GSTR-1 6A + 6B with their notes and amendments', heads: ['v', 'i', 'cs'],
      b3: [['3.1b', 1]], g1: [['EXP', 1], ['SEZ', 1], ['CDNR_SEZ', 1], ['CDNUR_EXPWP', 1], ['CDNUR_EXPWOP', 1], ['EXPA', 1], ['SEZA', 1], ['CDNRA_SEZ', 1], ['CDNURA_EXPWP', 1], ['CDNURA_EXPWOP', 1]] },
    { id: 'C', title: 'Nil rated and exempted supplies', sub: '3.1(c) vs GSTR-1 Table 8 (nil + exempted)', heads: ['v'], b3: [['3.1c', 1]], g1: [['NIL', 1], ['EXEMPT', 1]] },
    { id: 'D', title: 'Non-GST supplies', sub: '3.1(e) vs GSTR-1 Table 8 (non-GST)', heads: ['v'], b3: [['3.1e', 1]], g1: [['NONGST', 1]] },
    { id: 'E', title: 'Supplies through e-commerce operators u/s 9(5)', sub: '3.1.1(ii) vs GSTR-1 Table 14(b) and 14A(b)', heads: ['v'], b3: [['3.1.1ii', 1]], g1: [['ECO_95', 1], ['ECOA_95', 1]] },
    { id: 'F', title: 'Supplies on which you (as ECO) pay tax u/s 9(5)', sub: '3.1.1(i) vs GSTR-1 Table 15 and 15A', heads: ALL5, b3: [['3.1.1i', 1]], g1: [['SUP95', 1], ['SUP95AR', 1], ['SUP95AU', 1]] },
    { id: 'T', title: 'Total tax liability (other than reverse charge)', sub: '3.1(a)+(b)+(c)+(e)+3.1.1(ii) vs GSTR-1 Total Liability (taxes: 3.1(a)+(b))', heads: ALL5,
      b3: [['3.1a', 1], ['3.1b', 1], ['3.1c', 1, 'v'], ['3.1e', 1, 'v'], ['3.1.1ii', 1, 'v']], g1: [['TL', 1]] }
  ];
  GST.reconValue = function (f, parts, head) {
    if (!f) return null;
    var t = 0, any = false;
    parts.forEach(function (p) {
      var x = f[p[0]];
      if (!x) return;
      if (p[2] && p[2] !== head) return;
      if (x[head] != null) { t += p[1] * x[head]; any = true; }
    });
    return any ? r2(t) : 0;
  };

  // ---------------------------------------------------------------- grouping helpers
  // returns: [{gstin, fy, state, legal, months: {m: return}}] and duplicates (same GSTIN + period, keep latest ARN date)
  function dkey(d) { var m = String(d || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + m[2] + m[1] : ''; }
  GST.group = function (rets) {
    var map = {}, dups = [];
    rets.filter(function (r) { return r && !r.error && r.gstin && r.fy && r.month; }).forEach(function (r) {
      var k = r.gstin + '|' + r.fy;
      var g = map[k] || (map[k] = { gstin: r.gstin, fy: r.fy, state: r.state, legal: r.legal || r.trade || '', months: {} });
      var cur = g.months[r.month];
      if (cur) { if (dkey(r.arnDate) >= dkey(cur.arnDate)) { dups.push(cur); g.months[r.month] = r; } else dups.push(r); }
      else g.months[r.month] = r;
    });
    var list = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return a.fy < b.fy ? -1 : a.fy > b.fy ? 1 : a.gstin < b.gstin ? -1 : 1; });
    return { list: list, dups: dups };
  };

  // form-layout table (rows = field × head, columns = FY months + total)
  GST.monthTable = function (fields, g, opts) {
    opts = opts || {};
    var rows = [];
    fields.forEach(function (fd) {
      fd.heads.forEach(function (h, hi) {
        var vals = GST.FY_MONTHS.map(function (m) { var r = g.months[m]; if (!r) return null; var x = r.f[fd.key]; return x && x[h] != null ? x[h] : (r ? 0 : null); });
        var tot = r2(vals.reduce(function (t, v) { return t + (v || 0); }, 0));
        var nz = vals.some(function (v) { return v; });
        rows.push({ key: fd.key, tbl: fd.tbl, label: fd.label, head: h, first: hi === 0, vals: vals, total: h === 'rec' && fd.key === 'DOC' ? tot : tot, nz: nz, keep: fd.keep });
      });
    });
    if (opts.hideZero) {
      var live = {};
      rows.forEach(function (r) { if (r.nz || r.keep) live[r.key] = 1; });
      rows = rows.filter(function (r) { return live[r.key]; });
      rows.forEach(function (r, i) { r.first = i === 0 || rows[i - 1].key !== r.key; });
    }
    return rows;
  };

export default GST;
