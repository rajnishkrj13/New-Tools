/* eslint-disable -- ported verbatim from the GST Toolkit; kept identical so its tested behaviour does not change */
// @ts-nocheck -- ported verbatim from GST_Toolkit_V1.html ("GSTR-2B merger core"); its logic is kept exactly.
/**
 * GSTR-2B merger core: reads portal GSTR-2B Excel downloads and the user's merged workbook,
 * merges B2B / B2BA / B2B-CDNR rows by State + GSTR-2B Month, and writes the merged file.
 * Pure logic, no DOM. SheetJS (reading) and ExcelJS (writing) are passed in when loaded.
 */
export function makeGstr2b(XLSX: any, ExcelJS: any): any {
    return (function () {
    'use strict';
  
    var MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    var MON3 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  
    // State code -> [name as the portal prints it in POS, short label used when no mapping exists]
    var STATE_CODES = {
      '01':['Jammu and Kashmir','Jammu'], '02':['Himachal Pradesh','Himachal Pradesh'], '03':['Punjab','Punjab'],
      '04':['Chandigarh','Chandigarh'], '05':['Uttarakhand','Uttarakhand'], '06':['Haryana','Haryana'], '07':['Delhi','Delhi'],
      '08':['Rajasthan','Rajasthan'], '09':['Uttar Pradesh','Uttar Pradesh'], '10':['Bihar','Bihar'], '11':['Sikkim','Sikkim'],
      '12':['Arunachal Pradesh','Arunachal Pradesh'], '13':['Nagaland','Nagaland'], '14':['Manipur','Manipur'], '15':['Mizoram','Mizoram'],
      '16':['Tripura','Tripura'], '17':['Meghalaya','Meghalaya'], '18':['Assam','Assam'], '19':['West Bengal','West Bengal'],
      '20':['Jharkhand','Jharkhand'], '21':['Odisha','Odisha'], '22':['Chhattisgarh','Chhattisgarh'], '23':['Madhya Pradesh','MP'],
      '24':['Gujarat','Gujarat'], '26':['Dadra and Nagar Haveli and Daman and Diu','Daman & Diu'], '27':['Maharashtra','Maharashtra'],
      '29':['Karnataka','Karnataka'], '30':['Goa','Goa'], '31':['Lakshadweep','Lakshadweep'], '32':['Kerala','Kerala'],
      '33':['Tamil Nadu','Tamil Nadu'], '34':['Puducherry','Puducherry'], '35':['Andaman and Nicobar Islands','Andaman & Nicobar'],
      '36':['Telangana','Telangana'], '37':['Andhra Pradesh','Andhra Pradesh'], '38':['Ladakh','Ladakh'], '97':['Other Territory','Other Territory']
    };
  
    var NA6 = [null, null, null, null, null, null];
    var SPEC = {
      'B2B': {
        headers: ['State','GSTR-2B Month','GSTIN','Party Name','Invoice number','Type','Invoice Date','Invoice Value','POS','RCM','Taxable','IGST','CGST','SGST','Cess','Return Filling Month','Return Filling Date','ITC Availability'],
        anchor: 0, endHeader: 'itc availability', sliceLen: 16, filename: false,
        numeric: [7,10,11,12,13,14], soft: [],
        taxCols: { igst: 11, cgst: 12, sgst: 13 },
        widths: [13,11,18,45,20,9,12,13,18,6,12,11,11,11,8,13,14,10]
      },
      'B2BA': {
        headers: ['State','GSTR-2B Month','Original Invoice','Date','GSTIN','Party Name','Invoice number','Type','Invoice Date','Invoice Value','POS','RCM','Taxable','IGST','CGST','SGST','Cess']
          .concat(NA6).concat(['Return Filling Month','Return Filling Date','ITC Availability','Reason','Source Filename']),
        anchor: 2, endHeader: 'reason', sliceLen: 25, filename: true,
        numeric: [9,12,13,14,15,16], soft: [18,19,20,21],
        taxCols: { igst: 13, cgst: 14, sgst: 15 },
        widths: [13,11,18,11,18,40,18,9,11,12,18,6,12,11,11,11,8,6,6,6,6,6,20,13,14,10,10,46]
      },
      'B2B-CDNR': {
        headers: ['State','GSTR-2B Month','GSTIN','Party Name','Invoice number',null,'Type','Invoice Date','Invoice Value','POS','RCM','Taxable','IGST','CGST','SGST','Cess']
          .concat(NA6).concat(['Return Filling Month','Return Filling Date','ITC Availability']),
        anchor: 0, endHeader: 'itc availability', sliceLen: 23, filename: false,
        numeric: [8,11,12,13,14,15], soft: [17,18,19,20],
        taxCols: { igst: 12, cgst: 13, sgst: 14 },
        widths: [13,11,18,45,20,11,9,12,13,18,6,12,11,11,11,8,6,6,6,6,6,20,13,14,10]
      }
    };
    var SHEET_NAMES = ['B2B','B2BA','B2B-CDNR'];
    var SKIP_EXTRA = ['read me','itc available','itc not available','itc reversal','itc rejected'];
    var GSTIN_RE = /^[0-9A-Z]{15}$/;
  
    function norm(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim().toLowerCase(); }
    function isGstin(v) { return v != null && GSTIN_RE.test(String(v).trim().toUpperCase()); }
  
    function serialFromYM(y, m0) { return Math.round((Date.UTC(y, m0, 1) - Date.UTC(1899, 11, 30)) / 86400000); }
    function ymFromSerial(s) {
      var d = new Date(Date.UTC(1899, 11, 30) + Math.round(s) * 86400000);
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    }
    function monthLabel(serial) {
      if (serial == null || isNaN(serial)) return '?';
      var ym = ymFromSerial(serial);
      return MON3[ym.m] + '-' + String(ym.y).slice(2);
    }
    // Normalise whatever sits in the "GSTR-2B Month" column to the 1st-of-month Excel serial.
    function toMonthSerial(v) {
      if (v == null || v === '') return null;
      if (typeof v === 'number') { var ym = ymFromSerial(v); return serialFromYM(ym.y, ym.m); }
      if (v instanceof Date) return serialFromYM(v.getUTCFullYear(), v.getUTCMonth());
      var s = String(v).trim();
      var m = s.match(/^([A-Za-z]{3,9})[\s\-'’]*(\d{2}|\d{4})$/);
      if (m) {
        var idx = MONTHS.findIndex(function (n) { return n.indexOf(m[1].toLowerCase().slice(0, 3)) === 0; });
        if (idx >= 0) { var yy = +m[2]; if (yy < 100) yy += 2000; return serialFromYM(yy, idx); }
      }
      return null;
    }
    function toNumber(v) {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        var t = v.replace(/,/g, '').trim();
        if (/^-?\d*\.?\d+$/.test(t)) return Number(t);
      }
      return v;
    }
    function initials(name) {
      if (!name) return '';
      return String(name).replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean).map(function (w) { return w[0].toUpperCase(); }).join('');
    }
  
    function sheetAoa(wb, name) {
      var ws = wb.Sheets[name];
      if (!ws) return null;
      return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
    }
    function findSheet(wb, name) {
      var target = norm(name);
      for (var i = 0; i < wb.SheetNames.length; i++) if (norm(wb.SheetNames[i]) === target) return wb.SheetNames[i];
      return null;
    }
  
    /* ---------- Portal GSTR-2B file ---------- */
    function parsePortal(data, filename) {
      var out = { filename: filename, gstin: null, legalName: null, fy: null, period: null, monthSerial: null,
        sheets: {}, counts: {}, totals: { igst: 0, cgst: 0, sgst: 0 }, extras: [], warnings: [], errors: [] };
      var wb;
      try { wb = data && data.SheetNames ? data : XLSX.read(data, { type: 'array' }); }
      catch (e) { out.errors.push('Could not open this file as an Excel workbook.'); return out; }
  
      // Read me: Financial Year / Tax Period / GSTIN / Legal Name
      var rmName = findSheet(wb, 'Read me');
      if (rmName) {
        var rm = sheetAoa(wb, rmName) || [];
        for (var i = 0; i < Math.min(rm.length, 25); i++) {
          var r = rm[i] || [], key = norm(r[0]);
          var val = null;
          for (var c = 1; c < r.length; c++) if (r[c] != null && String(r[c]).trim() !== '') { val = String(r[c]).trim(); break; }
          if (!val) continue;
          if (key === 'financial year') out.fy = val;
          else if (key === 'tax period') out.period = val;
          else if (key === 'gstin') out.gstin = val.toUpperCase();
          else if (key === 'legal name') out.legalName = val;
        }
      }
      if (out.fy && out.period) {
        var mi = MONTHS.indexOf(norm(out.period));
        var fyStart = parseInt(String(out.fy).slice(0, 4), 10);
        if (mi >= 0 && fyStart) out.monthSerial = serialFromYM(mi <= 2 ? fyStart + 1 : fyStart, mi);
      }
      // Filename fallback / cross-check: MMYYYY_GSTIN_GSTR2B_...
      var fm = String(filename).match(/(\d{2})(\d{4})_([0-9A-Z]{15})_GSTR2B/i);
      if (fm) {
        var fSerial = serialFromYM(+fm[2], +fm[1] - 1), fG = fm[3].toUpperCase();
        if (out.monthSerial == null) out.monthSerial = fSerial;
        else if (out.monthSerial !== fSerial) out.warnings.push('File name says ' + monthLabel(fSerial) + ' but the Read me sheet says ' + monthLabel(out.monthSerial) + '. Using the Read me month.');
        if (!out.gstin) out.gstin = fG;
        else if (out.gstin !== fG) out.warnings.push('File name GSTIN ' + fG + ' differs from Read me GSTIN ' + out.gstin + '. Using the Read me GSTIN.');
      }
      if (!out.gstin) out.errors.push('Could not find the GSTIN in the Read me sheet or the file name.');
      if (out.monthSerial == null) out.errors.push('Could not find the tax period in the Read me sheet or the file name.');
  
      var foundAny = false;
      SHEET_NAMES.forEach(function (name) {
        var spec = SPEC[name];
        out.sheets[name] = []; out.counts[name] = 0;
        var sn = findSheet(wb, name);
        if (!sn) { out.warnings.push('Sheet ' + name + ' is missing in this file.'); return; }
        foundAny = true;
        var aoa = sheetAoa(wb, sn) || [];
        var hdr = -1;
        for (var i = 0; i < Math.min(aoa.length, 20); i++) {
          if (norm((aoa[i] || [])[spec.anchor]) === 'gstin of supplier') { hdr = i; break; }
        }
        if (hdr < 0) { out.errors.push(name + ': header row "GSTIN of supplier" not found — the portal layout may have changed.'); return; }
        var endIdx = -1, hrow = aoa[hdr] || [];
        for (var c = spec.anchor; c < hrow.length; c++) if (norm(hrow[c]) === spec.endHeader) { endIdx = c; break; }
        if (endIdx + 1 !== spec.sliceLen) {
          out.errors.push(name + ': columns are not where expected (found "' + spec.endHeader + '" at column ' + (endIdx + 1) + ', expected ' + spec.sliceLen + '). This sheet was skipped so nothing lands in the wrong column.');
          return;
        }
        for (var j = hdr + 1; j < aoa.length; j++) {
          var row = aoa[j] || [];
          if (!isGstin(row[spec.anchor])) continue;
          var vals = [];
          for (var k = 0; k < spec.sliceLen; k++) vals.push(row[k] === undefined ? null : row[k]);
          var o = [null, out.monthSerial].concat(vals);
          if (spec.filename) o.push(filename);
          spec.numeric.forEach(function (ix) { o[ix] = toNumber(o[ix]); });
          spec.soft.forEach(function (ix) { o[ix] = toNumber(o[ix]); });
          out.sheets[name].push(o);
        }
        out.counts[name] = out.sheets[name].length;
      });
      if (!foundAny) out.errors.push('No B2B, B2BA or B2B-CDNR sheet found. Is this a GSTR-2B download from the GST portal?');
  
      // Tax totals of B2B invoices for eyeballing against the portal
      (out.sheets['B2B'] || []).forEach(function (r) {
        var t = SPEC['B2B'].taxCols;
        out.totals.igst += typeof r[t.igst] === 'number' ? r[t.igst] : 0;
        out.totals.cgst += typeof r[t.cgst] === 'number' ? r[t.cgst] : 0;
        out.totals.sgst += typeof r[t.sgst] === 'number' ? r[t.sgst] : 0;
      });
  
      // Other sheets that carry data but aren't part of the merged format
      wb.SheetNames.forEach(function (sn) {
        var n = norm(sn);
        if (SKIP_EXTRA.indexOf(n) >= 0 || SHEET_NAMES.some(function (s) { return norm(s) === n; })) return;
        var aoa = sheetAoa(wb, sn) || [], cnt = 0;
        for (var i = 4; i < aoa.length; i++) {
          var nums = 0; (aoa[i] || []).forEach(function (v) { if (typeof v === 'number') nums++; });
          if (nums >= 2) cnt++;
        }
        if (cnt) out.extras.push({ sheet: sn, rows: cnt });
      });
      return out;
    }
  
    /* ---------- Existing merged (master) file ---------- */
    function parseMaster(data, filename) {
      var out = { filename: filename, sheets: {}, headers: {}, extraSheets: [], learned: {}, labelPos: {}, labels: [], warnings: [], errors: [] };
      var wb;
      try { wb = data && data.SheetNames ? data : XLSX.read(data, { type: 'array' }); }
      catch (e) { out.errors.push('Could not open the merged file as an Excel workbook.'); return out; }
      var matched = 0;
      SHEET_NAMES.forEach(function (name) {
        var spec = SPEC[name];
        out.sheets[name] = []; out.headers[name] = spec.headers.slice();
        var sn = findSheet(wb, name);
        if (!sn) { out.warnings.push('Sheet ' + name + ' not found in the merged file; it will start empty.'); return; }
        matched++;
        var aoa = sheetAoa(wb, sn) || [];
        if (!aoa.length) return;
        var head = aoa[0] || [];
        if (norm(head[0]) !== 'state' || norm(head[1]) !== 'gstr-2b month') {
          out.errors.push(name + ': the first row should start with "State" and "GSTR-2B Month". Is this the merged file?');
          return;
        }
        var width = spec.headers.length;
        var hdr = []; for (var c = 0; c < width; c++) hdr.push(head[c] === undefined ? null : head[c]);
        out.headers[name] = hdr;
        var widest = 0;
        for (var i = 1; i < aoa.length; i++) {
          var row = aoa[i] || [];
          if (!row.some(function (v) { return v != null && v !== ''; })) continue;
          widest = Math.max(widest, row.length);
          var o = []; for (var k = 0; k < width; k++) o.push(row[k] === undefined ? null : row[k]);
          var ms = toMonthSerial(o[1]);
          if (ms != null) o[1] = ms;
          out.sheets[name].push(o);
        }
        if (widest > width) out.warnings.push(name + ': the merged file has data beyond column ' + width + '; those extra columns are not carried over.');
      });
      if (!matched) out.errors.push('This file has none of the B2B, B2BA or B2B-CDNR sheets. Pick your merged GSTR-2B file here, and the portal downloads on the right.');
  
      // Learn GSTIN -> State from B2BA "Source Filename"
      (out.sheets['B2BA'] || []).forEach(function (r) {
        var f = r[27], st = r[0];
        if (!f || !st) return;
        var m = String(f).match(/\d{6}_([0-9A-Z]{15})_GSTR2B/i);
        if (m) out.learned[m[1].toUpperCase()] = String(st);
      });
      // Dominant POS per State label (to suggest a label for a new GSTIN)
      var posCol = { 'B2B': 8, 'B2BA': 10, 'B2B-CDNR': 9 };
      var tally = {};
      SHEET_NAMES.forEach(function (name) {
        (out.sheets[name] || []).forEach(function (r) {
          var st = r[0]; if (st == null || st === '') return;
          st = String(st);
          tally[st] = tally[st] || {};
          var p = r[posCol[name]]; if (p) tally[st][p] = (tally[st][p] || 0) + 1;
        });
      });
      Object.keys(tally).forEach(function (st) {
        var best = null, bc = -1;
        Object.keys(tally[st]).forEach(function (p) { if (tally[st][p] > bc) { bc = tally[st][p]; best = p; } });
        out.labelPos[st] = best;
      });
      out.labels = Object.keys(tally).sort();
  
      wb.SheetNames.forEach(function (sn) {
        if (SHEET_NAMES.some(function (s) { return norm(s) === norm(sn); })) return;
        out.extraSheets.push({ name: sn, aoa: sheetAoa(wb, sn) || [] });
      });
      return out;
    }
  
    /* Suggest a State label for a recipient GSTIN. */
    function suggestState(gstin, saved, master) {
      gstin = String(gstin || '').toUpperCase();
      if (saved && saved[gstin]) return { label: saved[gstin], source: 'saved' };
      if (master && master.learned[gstin]) return { label: master.learned[gstin], source: 'learned' };
      var sc = STATE_CODES[gstin.slice(0, 2)];
      if (!sc) return { label: '', source: 'unknown' };
      if (master && master.labels.length) {
        var cands = master.labels.filter(function (l) { return master.labelPos[l] === sc[0]; });
        if (cands.length === 1) return { label: cands[0], source: 'pos' };
        if (cands.length > 1) return { label: '', source: 'ambiguous', candidates: cands };
      }
      return { label: sc[1], source: 'code' };
    }
  
    function coverage(sheets) {
      var cov = {};
      (sheets['B2B'] || []).forEach(function (r) {
        var st = r[0] == null ? '(blank)' : String(r[0]), m = r[1];
        cov[st] = cov[st] || {};
        cov[st][m] = (cov[st][m] || 0) + 1;
      });
      return cov;
    }
  
    /* Merge. items: [{parsed, state}] — later items win when the same State+Month repeats. */
    function merge(master, items) {
      var report = { replaced: [], added: [], before: {}, after: {}, keys: {} };
      var byKey = {}, order = [];
      items.forEach(function (it) {
        var key = it.state + '|' + it.parsed.monthSerial;
        if (!byKey[key]) order.push(key);
        byKey[key] = it;
      });
      var result = {};
      SHEET_NAMES.forEach(function (name) {
        var existing = master ? master.sheets[name] : [];
        report.before[name] = existing.length;
        var rowsFor = function (key) {
          var it = byKey[key];
          return it.parsed.sheets[name].map(function (r) { var c = r.slice(); c[0] = it.state; return c; });
        };
        var out = [], inserted = {};
        existing.forEach(function (r) {
          var key = String(r[0]) + '|' + r[1];
          if (byKey[key]) {
            if (!inserted[key]) { inserted[key] = true; Array.prototype.push.apply(out, rowsFor(key)); }
            return; // drop the old row for a State+Month being refreshed
          }
          out.push(r);
        });
        // Appended keys, in month order then upload order
        var rest = order.filter(function (k) { return !inserted[k]; });
        rest.sort(function (a, b) { return byKey[a].parsed.monthSerial - byKey[b].parsed.monthSerial || order.indexOf(a) - order.indexOf(b); });
        rest.forEach(function (k) { Array.prototype.push.apply(out, rowsFor(k)); });
        result[name] = out;
        report.after[name] = out.length;
      });
      // Which keys replaced existing data (in any sheet)?
      var existingKeys = {};
      if (master) SHEET_NAMES.forEach(function (name) { master.sheets[name].forEach(function (r) { existingKeys[String(r[0]) + '|' + r[1]] = true; }); });
      order.forEach(function (k) { report.keys[k] = existingKeys[k] ? 'replaced' : 'added'; (existingKeys[k] ? report.replaced : report.added).push(k); });
      return { sheets: result, headers: master ? master.headers : null, extraSheets: master ? master.extraSheets : [], report: report };
    }
  
    /* Write the merged workbook in the same layout as the user's merged file. Returns an ArrayBuffer/Buffer. */
    async function writeWorkbook(merged) {
      var wb = new ExcelJS.Workbook();
      wb.creator = 'GSTR-2B merger';
      var headFont = { name: 'Aptos Narrow', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      var headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
      SHEET_NAMES.forEach(function (name) {
        var spec = SPEC[name];
        var ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
        var numericSet = {}; spec.numeric.concat(spec.soft).forEach(function (i) { numericSet[i] = true; });
        ws.columns = spec.headers.map(function (h, i) {
          var style;
          if (i === 0) style = { font: { name: 'Aptos Narrow', size: 11 } };
          else if (i === 1) style = { font: { name: 'Aptos Narrow', size: 11 }, numFmt: 'mmm-yy' };
          else if (numericSet[i]) style = { font: { name: 'Calibri', size: 11 }, numFmt: '0.00', alignment: { horizontal: 'right' } };
          else style = { font: { name: 'Calibri', size: 11 }, alignment: { horizontal: 'left' } };
          return { width: spec.widths[i] || 12, style: style };
        });
        var headers = (merged.headers && merged.headers[name]) || spec.headers;
        var hr = ws.addRow(headers);
        for (var c = 1; c <= spec.headers.length; c++) {
          var cell = hr.getCell(c);
          cell.font = headFont; cell.fill = headFill; cell.alignment = { vertical: 'middle' }; cell.numFmt = 'General';
        }
        var rows = merged.sheets[name];
        for (var i = 0; i < rows.length; i++) ws.addRow(rows[i]);
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: spec.headers.length } };
      });
      (merged.extraSheets || []).forEach(function (s) {
        var ws = wb.addWorksheet(s.name);
        s.aoa.forEach(function (r) { ws.addRow(r); });
      });
      return wb.xlsx.writeBuffer();
    }
  
    /* 'portal' | 'master' | 'unknown' */
    function sniff(wb) {
      if (findSheet(wb, 'Read me')) return 'portal';
      var b2b = findSheet(wb, 'B2B');
      if (b2b) {
        var ws = wb.Sheets[b2b];
        var v = function (addr) { return ws[addr] ? ws[addr].v : null; };
        if (norm(v('A1')) === 'state' && norm(v('B1')) === 'gstr-2b month') return 'master';
        for (var i = 1; i <= 10; i++) if (norm(v('A' + i)) === 'gstin of supplier') return 'portal';
      }
      return 'unknown';
    }
  
    return {
      sniff: sniff,
      SPEC: SPEC, SHEET_NAMES: SHEET_NAMES, STATE_CODES: STATE_CODES,
      parsePortal: parsePortal, parseMaster: parseMaster, suggestState: suggestState,
      merge: merge, writeWorkbook: writeWorkbook, coverage: coverage,
      monthLabel: monthLabel, initials: initials
    };
  })();
}
