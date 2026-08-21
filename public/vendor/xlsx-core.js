/*!
 * xlsx-core.js — 최소 침습(minimal-diff) XLSX 리더/라이터
 *
 * .xlsx 는 XML 들이 들어있는 zip 파일이다. 이 모듈은 워크북 전체를 다시
 * 만들지 않고, 사용자가 실제로 고친 셀에 해당하는 XML 노드만 수정한 뒤
 * 나머지 zip 엔트리는 원본 바이트 그대로 다시 압축한다.
 * 덕분에 서식 / 수식 / 차트 / 조건부서식 / 시트보호 등 이 에디터가
 * 이해하지 못하는 요소들도 저장 후 그대로 살아남는다.
 *
 * 의존성: fflate (zip), DOMParser/XMLSerializer (브라우저 내장)
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.XlsxCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  var REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
  var CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';

  function deps() {
    var fflate = typeof global !== 'undefined' && global.fflate;
    return {
      fflate: (typeof self !== 'undefined' && self.fflate) || (typeof globalThis !== 'undefined' && globalThis.fflate) || fflate,
      DOMParser: (typeof globalThis !== 'undefined' && globalThis.DOMParser),
      XMLSerializer: (typeof globalThis !== 'undefined' && globalThis.XMLSerializer)
    };
  }

  /* ---------------------------------------------------------------- utils */

  function kids(el, localName) {
    var out = [];
    if (!el) return out;
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1 && (n.localName || n.nodeName.replace(/^.*:/, '')) === localName) out.push(n);
    }
    return out;
  }
  function kid(el, localName) { return kids(el, localName)[0] || null; }

  function descendants(el, localName) {
    var out = [];
    (function walk(node) {
      for (var n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType !== 1) continue;
        if ((n.localName || n.nodeName.replace(/^.*:/, '')) === localName) out.push(n);
        walk(n);
      }
    })(el);
    return out;
  }

  function textOf(el) {
    if (!el) return '';
    var s = '';
    (function walk(node) {
      for (var n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3 || n.nodeType === 4) s += n.nodeValue;
        else if (n.nodeType === 1) walk(n);
      }
    })(el);
    return s;
  }

  function colToName(col) { // 1 -> A
    var s = '';
    while (col > 0) { var m = (col - 1) % 26; s = String.fromCharCode(65 + m) + s; col = (col - m - 1) / 26; }
    return s;
  }
  function nameToCol(name) { // A -> 1
    var c = 0;
    for (var i = 0; i < name.length; i++) c = c * 26 + (name.charCodeAt(i) - 64);
    return c;
  }
  function parseRef(ref) {
    var m = /^([A-Za-z]+)(\d+)$/.exec(ref || '');
    if (!m) return null;
    return { col: nameToCol(m[1].toUpperCase()), row: parseInt(m[2], 10) };
  }
  function makeRef(row, col) { return colToName(col) + row; }

  /* --------------------------------------------------------- date helpers */

  var DATE_FMT_IDS = [14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57];

  function fmtLooksLikeDate(code) {
    if (!code) return false;
    // 따옴표 안의 리터럴과 색상 지정자([Red] 등)는 무시한다.
    var stripped = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
    return /[ymdhs]/i.test(stripped) && !/^(General|@)$/i.test(stripped);
  }
  function fmtHasTime(code) {
    if (!code) return false;
    var stripped = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
    return /[hs]/i.test(stripped);
  }

  function serialToDate(serial, date1904) {
    var epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    var days = Math.floor(serial);
    // 1900 시스템의 가짜 윤일(1900-02-29) 보정
    if (!date1904 && serial < 60) days += 1;
    var ms = Math.round((serial - Math.floor(serial)) * 86400000);
    return new Date(epoch + days * 86400000 + ms);
  }
  function dateToSerial(d, date1904) {
    var epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    var utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
    var serial = (utc - epoch) / 86400000;
    if (!date1904 && serial < 60) serial -= 1;
    return serial;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function formatDate(d, withTime) {
    var s = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    if (withTime) s += ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
    return s;
  }
  function parseDateText(text) {
    var m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text.trim());
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    if (isNaN(d.getTime()) || d.getMonth() !== +m[2] - 1) return null;
    return d;
  }

  /* ------------------------------------------------------------ 워크북 읽기 */

  function parseWorkbook(bytes) {
    var d = deps();
    if (!d.fflate) throw new Error('fflate 라이브러리를 찾을 수 없습니다.');
    var files = d.fflate.unzipSync(bytes);
    var parser = new d.DOMParser();

    function has(path) { return Object.prototype.hasOwnProperty.call(files, path); }
    function textFile(path) { return has(path) ? d.fflate.strFromU8(files[path]) : null; }
    function xml(path) {
      var t = textFile(path);
      return t == null ? null : parser.parseFromString(t, 'application/xml');
    }

    var wbDoc = xml('xl/workbook.xml');
    if (!wbDoc) throw new Error('올바른 .xlsx 파일이 아닙니다 (xl/workbook.xml 없음).');

    // 워크북 관계(rId -> 시트 파트 경로)
    var relDoc = xml('xl/_rels/workbook.xml.rels');
    var rels = {};
    if (relDoc) {
      descendants(relDoc.documentElement, 'Relationship').forEach(function (r) {
        var target = r.getAttribute('Target') || '';
        var path = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
        rels[r.getAttribute('Id')] = { path: path.replace(/\/[^/]+\/\.\.\//g, '/'), type: r.getAttribute('Type') || '' };
      });
    }

    var wbPr = kid(wbDoc.documentElement, 'workbookPr');
    var date1904 = !!wbPr && /^(1|true)$/i.test(wbPr.getAttribute('date1904') || wbPr.getAttribute('1904') || '');

    // 공유 문자열
    var sharedStrings = [];
    var ssDoc = xml('xl/sharedStrings.xml');
    if (ssDoc) {
      kids(ssDoc.documentElement, 'si').forEach(function (si) {
        var s = '';
        // <rPh>(후리가나)는 화면에 보이는 값이 아니므로 제외한다.
        (function walk(node) {
          for (var n = node.firstChild; n; n = n.nextSibling) {
            if (n.nodeType !== 1) continue;
            var ln = n.localName || n.nodeName.replace(/^.*:/, '');
            if (ln === 'rPh') continue;
            if (ln === 't') s += textOf(n); else walk(n);
          }
        })(si);
        sharedStrings.push(s);
      });
    }

    // 스타일 -> 셀 서식이 날짜인지 판정
    var numFmts = {};
    var cellXfs = [];
    var stDoc = xml('xl/styles.xml');
    if (stDoc) {
      var nfRoot = kid(stDoc.documentElement, 'numFmts');
      if (nfRoot) kids(nfRoot, 'numFmt').forEach(function (nf) {
        numFmts[nf.getAttribute('numFmtId')] = nf.getAttribute('formatCode') || '';
      });
      var xfRoot = kid(stDoc.documentElement, 'cellXfs');
      if (xfRoot) kids(xfRoot, 'xf').forEach(function (xf) {
        cellXfs.push(parseInt(xf.getAttribute('numFmtId') || '0', 10));
      });
    }
    function styleInfo(sIdx) {
      var id = cellXfs[sIdx == null ? 0 : sIdx];
      if (id == null) return { isDate: false, hasTime: false };
      var code = numFmts[String(id)];
      var isDate = code != null ? fmtLooksLikeDate(code) : DATE_FMT_IDS.indexOf(id) !== -1;
      var hasTime = code != null ? fmtHasTime(code) : (id >= 18 && id <= 22) || id === 45 || id === 46 || id === 47;
      return { isDate: isDate, hasTime: hasTime };
    }

    // 시트 목록
    var sheets = [];
    var sheetsEl = kid(wbDoc.documentElement, 'sheets');
    kids(sheetsEl, 'sheet').forEach(function (sh) {
      var rid = sh.getAttribute('r:id') || sh.getAttributeNS(REL_NS, 'id');
      var rel = rels[rid];
      if (!rel || !/worksheet$/.test(rel.type) || !has(rel.path)) return; // 차트시트 등은 건너뜀
      sheets.push({
        name: sh.getAttribute('name') || '',
        path: rel.path,
        state: sh.getAttribute('state') || 'visible'
      });
    });
    if (!sheets.length) throw new Error('편집할 수 있는 워크시트가 없습니다.');

    var wb = {
      files: files,
      date1904: date1904,
      sharedStrings: sharedStrings,
      sheets: sheets,
      _styleInfo: styleInfo,
      _parser: parser
    };

    sheets.forEach(function (sheet) {
      var doc = xml(sheet.path);
      var data = kid(doc.documentElement, 'sheetData');
      var cells = {};       // "row,col" -> cell
      var maxRow = 0, maxCol = 0;
      kids(data, 'row').forEach(function (rowEl) {
        var rowNum = parseInt(rowEl.getAttribute('r') || '0', 10);
        kids(rowEl, 'c').forEach(function (c) {
          var ref = c.getAttribute('r');
          var pos = parseRef(ref);
          if (!pos) return;
          if (!rowNum) rowNum = pos.row;
          var t = c.getAttribute('t') || 'n';
          var sIdx = parseInt(c.getAttribute('s') || '0', 10);
          var fEl = kid(c, 'f');
          var vEl = kid(c, 'v');
          var cell = {
            row: pos.row, col: pos.col, ref: ref,
            type: t, style: sIdx,
            formula: fEl ? textOf(fEl) : null,
            isDate: false, value: null, text: ''
          };
          if (t === 's') {
            var idx = parseInt(textOf(vEl) || '0', 10);
            cell.value = sharedStrings[idx] != null ? sharedStrings[idx] : '';
            cell.text = cell.value;
          } else if (t === 'inlineStr') {
            cell.value = textOf(kid(c, 'is'));
            cell.text = cell.value;
          } else if (t === 'str' || t === 'e') {
            cell.value = textOf(vEl);
            cell.text = cell.value;
          } else if (t === 'b') {
            cell.value = textOf(vEl) === '1';
            cell.text = cell.value ? 'TRUE' : 'FALSE';
          } else if (t === 'd') {
            cell.value = textOf(vEl);
            cell.text = cell.value;
          } else {
            var raw = textOf(vEl);
            if (raw === '') { cell.value = null; cell.text = ''; }
            else {
              var num = parseFloat(raw);
              cell.value = num;
              var info = styleInfo(sIdx);
              if (info.isDate && isFinite(num)) {
                cell.isDate = true;
                cell.hasTime = info.hasTime;
                cell.text = formatDate(serialToDate(num, date1904), info.hasTime);
              } else {
                cell.text = String(num);
              }
            }
          }
          cells[cell.row + ',' + cell.col] = cell;
          if (cell.row > maxRow) maxRow = cell.row;
          if (cell.col > maxCol) maxCol = cell.col;
        });
        if (rowNum > maxRow) maxRow = rowNum;
      });
      sheet.cells = cells;
      sheet.rowCount = maxRow;
      sheet.colCount = maxCol;
    });

    return wb;
  }

  /* ------------------------------------------------------------ 워크북 쓰기 */

  // text -> 셀에 실제로 저장할 값의 종류를 결정한다.
  function classify(text, prev) {
    var t = String(text);
    if (t === '') return { kind: 'blank' };
    if (t.charAt(0) === '=' && t.length > 1) return { kind: 'formula', value: t.slice(1) };
    if (prev && prev.isDate) {
      var d = parseDateText(t);
      if (d) return { kind: 'date', value: d };
    }
    if (/^-?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/.test(t.trim()) && !/^-?0\d/.test(t.trim())) {
      var n = Number(t.trim());
      if (isFinite(n)) return { kind: 'number', value: n };
    }
    if (/^(TRUE|FALSE)$/i.test(t.trim()) && prev && prev.type === 'b') {
      return { kind: 'bool', value: /^true$/i.test(t.trim()) };
    }
    return { kind: 'string', value: t };
  }

  function clearCell(c) {
    for (var n = c.firstChild; n;) { var next = n.nextSibling; c.removeChild(n); n = next; }
    c.removeAttribute('t');
  }

  function writeCell(doc, ns, c, spec, wb) {
    clearCell(c);
    function el(name) { return ns ? doc.createElementNS(ns, name) : doc.createElement(name); }
    function withText(name, value) { var e = el(name); e.appendChild(doc.createTextNode(String(value))); return e; }

    switch (spec.kind) {
      case 'blank':
        break;
      case 'formula':
        // 캐시된 결과값은 쓰지 않는다. 파일을 열 때 Excel 이 다시 계산한다.
        c.appendChild(withText('f', spec.value));
        break;
      case 'number':
        c.appendChild(withText('v', spec.value));
        break;
      case 'date':
        c.appendChild(withText('v', dateToSerial(spec.value, wb.date1904)));
        break;
      case 'bool':
        c.setAttribute('t', 'b');
        c.appendChild(withText('v', spec.value ? 1 : 0));
        break;
      default: // string -> 인라인 문자열(공유 문자열 테이블을 건드리지 않기 위해)
        c.setAttribute('t', 'inlineStr');
        var is = el('is');
        var tEl = withText('t', spec.value);
        if (/^\s|\s$/.test(spec.value)) tEl.setAttribute('xml:space', 'preserve');
        is.appendChild(tEl);
        c.appendChild(is);
    }
  }

  function ensureRow(doc, ns, sheetData, rowNum) {
    var rows = kids(sheetData, 'row');
    var before = null;
    for (var i = 0; i < rows.length; i++) {
      var r = parseInt(rows[i].getAttribute('r') || '0', 10);
      if (r === rowNum) return rows[i];
      if (r > rowNum) { before = rows[i]; break; }
    }
    var row = ns ? doc.createElementNS(ns, 'row') : doc.createElement('row');
    row.setAttribute('r', String(rowNum));
    sheetData.insertBefore(row, before);
    return row;
  }

  function ensureCell(doc, ns, row, rowNum, col) {
    var cs = kids(row, 'c');
    var before = null;
    for (var i = 0; i < cs.length; i++) {
      var pos = parseRef(cs[i].getAttribute('r'));
      var cc = pos ? pos.col : i + 1;
      if (cc === col) return cs[i];
      if (cc > col) { before = cs[i]; break; }
    }
    var c = ns ? doc.createElementNS(ns, 'c') : doc.createElement('c');
    c.setAttribute('r', makeRef(rowNum, col));
    row.insertBefore(c, before);
    return c;
  }

  /**
   * edits: [{ sheet: <index>, row: <1-based>, col: <1-based>, text: '...' }]
   * 반환값: 새 .xlsx 바이트 (Uint8Array)
   */
  function writeWorkbook(wb, edits) {
    var d = deps();
    var serializer = new d.XMLSerializer();
    var files = {};
    Object.keys(wb.files).forEach(function (k) { files[k] = wb.files[k]; });

    // 시트별로 편집 내용을 모은다.
    var bySheet = {};
    (edits || []).forEach(function (e) {
      (bySheet[e.sheet] = bySheet[e.sheet] || []).push(e);
    });

    var touchedFormula = false;

    Object.keys(bySheet).forEach(function (sheetIdx) {
      var sheet = wb.sheets[sheetIdx];
      if (!sheet) return;
      var doc = wb._parser.parseFromString(d.fflate.strFromU8(wb.files[sheet.path]), 'application/xml');
      var root = doc.documentElement;
      var ns = root.namespaceURI || MAIN_NS;
      var sheetData = kid(root, 'sheetData');
      if (!sheetData) {
        sheetData = doc.createElementNS(ns, 'sheetData');
        root.appendChild(sheetData);
      }

      var maxRow = sheet.rowCount, maxCol = sheet.colCount, minRow = Infinity, minCol = Infinity;
      Object.keys(sheet.cells).forEach(function (k) {
        var c = sheet.cells[k];
        if (c.row < minRow) minRow = c.row;
        if (c.col < minCol) minCol = c.col;
      });

      bySheet[sheetIdx].forEach(function (e) {
        var prev = sheet.cells[e.row + ',' + e.col] || null;
        var spec = classify(e.text, prev);
        if (spec.kind === 'formula') touchedFormula = true;
        if (prev && prev.formula) touchedFormula = true; // 기존 수식을 덮어씀

        var row = ensureRow(doc, ns, sheetData, e.row);
        row.removeAttribute('spans'); // 선택적 힌트일 뿐이라 지워도 안전하다
        var c = ensureCell(doc, ns, row, e.row, e.col);
        writeCell(doc, ns, c, spec, wb);

        // wb 모델은 일부러 건드리지 않는다. 디스크 쓰기가 실패하더라도
        // 화면 상태와 파일 상태가 어긋나지 않게 하기 위함이다.
        // 저장에 성공한 뒤 호출자가 결과 바이트를 다시 parseWorkbook 하면 된다.
        if (e.row > maxRow) maxRow = e.row;
        if (e.col > maxCol) maxCol = e.col;
        if (e.row < minRow) minRow = e.row;
        if (e.col < minCol) minCol = e.col;
      });

      // <dimension> 갱신 (없으면 만들지 않는다 — 선택 요소)
      var dim = kid(root, 'dimension');
      if (dim && isFinite(minRow) && isFinite(minCol) && maxRow && maxCol) {
        dim.setAttribute('ref', makeRef(minRow, minCol) + ':' + makeRef(maxRow, maxCol));
      }

      files[sheet.path] = d.fflate.strToU8(serializer.serializeToString(doc));
    });

    if (touchedFormula) {
      // 캐시된 수식 결과가 낡았으므로 열 때 전체 재계산을 요청하고,
      // 수식 의존성 캐시(calcChain)는 삭제해 Excel 이 새로 만들게 한다.
      setFullCalcOnLoad(wb, files, serializer);
      dropCalcChain(wb, files, serializer);
    }

    return d.fflate.zipSync(files, { level: 6 });
  }

  function setFullCalcOnLoad(wb, files, serializer) {
    var d = deps();
    var doc = wb._parser.parseFromString(d.fflate.strFromU8(files['xl/workbook.xml']), 'application/xml');
    var root = doc.documentElement;
    var ns = root.namespaceURI || MAIN_NS;
    var calcPr = kid(root, 'calcPr');
    if (!calcPr) {
      calcPr = doc.createElementNS(ns, 'calcPr');
      calcPr.setAttribute('calcId', '0');
      var extLst = kid(root, 'extLst'); // calcPr 은 스키마상 extLst 앞에 와야 한다
      root.insertBefore(calcPr, extLst || null);
    }
    calcPr.setAttribute('fullCalcOnLoad', '1');
    files['xl/workbook.xml'] = d.fflate.strToU8(serializer.serializeToString(doc));
  }

  function dropCalcChain(wb, files, serializer) {
    var d = deps();
    if (!files['xl/calcChain.xml']) return;
    delete files['xl/calcChain.xml'];

    if (files['[Content_Types].xml']) {
      var ct = wb._parser.parseFromString(d.fflate.strFromU8(files['[Content_Types].xml']), 'application/xml');
      descendants(ct.documentElement, 'Override').forEach(function (o) {
        if (o.getAttribute('PartName') === '/xl/calcChain.xml') o.parentNode.removeChild(o);
      });
      files['[Content_Types].xml'] = d.fflate.strToU8(serializer.serializeToString(ct));
    }
    if (files['xl/_rels/workbook.xml.rels']) {
      var rl = wb._parser.parseFromString(d.fflate.strFromU8(files['xl/_rels/workbook.xml.rels']), 'application/xml');
      descendants(rl.documentElement, 'Relationship').forEach(function (r) {
        if (/calcChain\.xml$/.test(r.getAttribute('Target') || '')) r.parentNode.removeChild(r);
      });
      files['xl/_rels/workbook.xml.rels'] = d.fflate.strToU8(serializer.serializeToString(rl));
    }
  }

  return {
    parseWorkbook: parseWorkbook,
    writeWorkbook: writeWorkbook,
    colToName: colToName,
    nameToCol: nameToCol,
    makeRef: makeRef,
    parseRef: parseRef,
    classify: classify,
    _internals: { serialToDate: serialToDate, dateToSerial: dateToSerial, formatDate: formatDate, parseDateText: parseDateText }
  };
});
