import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import * as fflate from 'fflate';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

globalThis.DOMParser = DOMParser;
globalThis.XMLSerializer = XMLSerializer;
globalThis.fflate = fflate;
// 브라우저와 동일한 조건(전역 스크립트)으로 로드한다.
(0, eval)(fs.readFileSync(path.join(ROOT, 'public/vendor/xlsx-core.js'), 'utf8'));
const Core = globalThis.XlsxCore;

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };

// ---- 픽스처 -------------------------------------------------------------
// SheetJS 는 수식 셀에 캐시값을 쓰지 않고, 읽을 때 수식전용 셀을 버린다.
// 그래서 픽스처에는 캐시값을 직접 넣고, 검증은 XML 을 직접 본다.
const ws = XLSX.utils.aoa_to_sheet([
  ['이름', '수량', '단가', '합계', '납기일'],
  ['볼트', 10, 250, { t: 'n', f: 'B2*C2' }, new Date(2026, 0, 15)],
  ['너트', 4, 120, { t: 'n', f: 'B3*C3' }, new Date(2026, 1, 3)],
  ['총계', null, null, { t: 'n', f: 'SUM(D2:D3)' }, null],
]);
const ws2 = XLSX.utils.aoa_to_sheet([['메모'], ['건드리지 않는 시트']]);
const wbf = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbf, ws, '발주');
XLSX.utils.book_append_sheet(wbf, ws2, '기타');
let bytes = new Uint8Array(XLSX.write(wbf, { type: 'array', bookType: 'xlsx', cellDates: true, bookSST: true }));

const sheetXmlOf = (buf, path) => fflate.strFromU8(fflate.unzipSync(buf)[path]);
{
  const files = fflate.unzipSync(bytes);
  let xml = fflate.strFromU8(files['xl/worksheets/sheet1.xml']);
  xml = xml.replace('<f>B2*C2</f>', '<f>B2*C2</f><v>2500</v>')
           .replace('<f>B3*C3</f>', '<f>B3*C3</f><v>480</v>')
           .replace('<f>SUM(D2:D3)</f>', '<f>SUM(D2:D3)</f><v>2980</v>');
  files['xl/worksheets/sheet1.xml'] = fflate.strToU8(xml);
  files['xl/media/image1.bin'] = fflate.strToU8('BINARY-BLOB-예제');   // 이 도구가 모르는 파트
  files['xl/calcChain.xml'] = fflate.strToU8('<?xml version="1.0"?><calcChain xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><c r="D2" i="1"/></calcChain>');
  bytes = fflate.zipSync(files, { level: 6 });
}
const originalFiles = fflate.unzipSync(bytes);

// ---- 1. 읽기 -------------------------------------------------------------
console.log('\n[1] 읽기');
const wb = Core.parseWorkbook(bytes);
ok(wb.sheets.length === 2, '시트 2개 인식: ' + wb.sheets.map(s => s.name).join(', '));
const s0 = wb.sheets[0];
ok(s0.cells['1,1'].text === '이름', 'A1 = 이름 (공유 문자열)');
ok(s0.cells['2,2'].value === 10, 'B2 = 10 (숫자)');
ok(s0.cells['2,4'].formula === 'B2*C2', 'D2 수식 인식: ' + s0.cells['2,4'].formula);
ok(s0.cells['2,4'].text === '2500', 'D2 캐시 결과값 표시: ' + s0.cells['2,4'].text);
ok(s0.cells['2,5'].isDate && s0.cells['2,5'].text === '2026-01-15', 'E2 날짜 인식: ' + s0.cells['2,5'].text);
ok(s0.rowCount === 4 && s0.colCount === 5, '범위 4행 x 5열');

// ---- 2. 편집 후 저장 ------------------------------------------------------
console.log('\n[2] 편집 후 저장');
const out = Core.writeWorkbook(wb, [
  { sheet: 0, row: 2, col: 2, text: '99' },
  { sheet: 0, row: 3, col: 1, text: '와셔' },
  { sheet: 0, row: 2, col: 5, text: '2026-03-01' },
  { sheet: 0, row: 5, col: 1, text: '신규행' },
  { sheet: 0, row: 5, col: 4, text: '=D4*2' },
  { sheet: 0, row: 3, col: 3, text: '' },
]);
ok(out instanceof Uint8Array && out.length > 0, '바이트 출력 (' + out.length + ' bytes)');

const outXml = sheetXmlOf(out, wb.sheets[0].path);
const rt = XLSX.read(out, { type: 'array', cellDates: true });
const sh = rt.Sheets['발주'];
ok(sh['B2'].v === 99, 'B2 -> 99');
ok(sh['A3'].v === '와셔', 'A3 -> 와셔');
ok(sh['A5'].v === '신규행', 'A5 새 셀 생성 (기존 범위 밖)');
ok(!sh['C3'] || sh['C3'].v === undefined, 'C3 비워짐');
const e2 = sh['E2'];
const e2str = e2.v instanceof Date ? e2.v.toISOString().slice(0, 10) : String(e2.v);
ok(e2str === '2026-03-01', 'E2 날짜 -> 2026-03-01 (실제: ' + e2str + ')');
ok(rt.Sheets['기타']['A2'].v === '건드리지 않는 시트', '다른 시트 내용 보존');
// 수식은 XML 로 직접 확인 (SheetJS 리더가 수식전용 셀을 버리므로)
ok(/<c r="D5"[^>]*><f>D4\*2<\/f><\/c>/.test(outXml), 'D5 새 수식 저장 (캐시값 없이)');
ok(outXml.includes('<f>B2*C2</f><v>2500</v>'), '건드리지 않은 D2 수식+캐시값 그대로 보존');
ok(outXml.includes('<f>SUM(D2:D3)</f>'), 'D4 SUM 수식 보존');
ok(/<dimension ref="A1:E5"\/>/.test(outXml), 'dimension 이 A1:E5 로 확장: ' + (/dimension ref="([^"]+)"/.exec(outXml) || [])[1]);
ok(/<c r="A5"[^>]*t="inlineStr"/.test(outXml), '새 문자열은 inlineStr 로 기록');
ok(outXml.indexOf('<c r="A5"') < outXml.indexOf('<c r="D5"'), '셀 순서 정렬 유지 (A5 < D5)');
ok(outXml.indexOf('<row r="4"') < outXml.indexOf('<row r="5"'), '행 순서 정렬 유지');
ok(outXml.includes('<ignoredErrors>'), 'sheetData 뒤쪽 요소(ignoredErrors) 보존');

// ---- 3. 최소 침습 / 보존 --------------------------------------------------
console.log('\n[3] 최소 침습 / 보존');
const newFiles = fflate.unzipSync(out);
const eq = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);
ok(eq(newFiles['xl/media/image1.bin'], originalFiles['xl/media/image1.bin']), '알 수 없는 파트(xl/media/image1.bin) 바이트 그대로 보존');
ok(eq(newFiles[wb.sheets[1].path], originalFiles[wb.sheets[1].path]), '수정하지 않은 시트 XML 바이트 동일');
ok(eq(newFiles['xl/styles.xml'], originalFiles['xl/styles.xml']), 'styles.xml 바이트 동일 (서식 보존)');
ok(eq(newFiles['xl/theme/theme1.xml'], originalFiles['xl/theme/theme1.xml']), 'theme1.xml 바이트 동일');
ok(!!originalFiles['xl/sharedStrings.xml'] && eq(newFiles['xl/sharedStrings.xml'], originalFiles['xl/sharedStrings.xml']), 'sharedStrings.xml 바이트 동일');
const missing = Object.keys(originalFiles).filter(k => !newFiles[k] && k !== 'xl/calcChain.xml');
ok(missing.length === 0, '없어진 파트 없음' + (missing.length ? ': ' + missing : ''));
ok(!newFiles['xl/calcChain.xml'], 'calcChain.xml 삭제됨 (Excel 이 재생성)');
ok(fflate.strFromU8(newFiles['xl/workbook.xml']).includes('fullCalcOnLoad="1"'), '열 때 전체 재계산 플래그 설정');
ok(!fflate.strFromU8(newFiles['[Content_Types].xml']).includes('calcChain'), '[Content_Types].xml 에서 calcChain 항목 제거');
ok(!fflate.strFromU8(newFiles['xl/_rels/workbook.xml.rels']).includes('calcChain'), 'workbook.xml.rels 에서 calcChain 관계 제거');

// ---- 4. 반복 저장 ---------------------------------------------------------
console.log('\n[4] 저장한 파일 다시 열어 재편집');
const wb2 = Core.parseWorkbook(out);
ok(wb2.sheets[0].cells['2,2'].value === 99, '재열람 시 B2 = 99');
ok(wb2.sheets[0].cells['2,5'].text === '2026-03-01', '재열람 시 E2 날짜 유지');
ok(wb2.sheets[0].cells['5,1'].text === '신규행', '재열람 시 A5 유지');
ok(wb2.sheets[0].cells['5,4'].formula === 'D4*2', '재열람 시 D5 수식 유지');
const out2 = Core.writeWorkbook(wb2, [{ sheet: 0, row: 2, col: 2, text: '7' }]);
ok(XLSX.read(out2, { type: 'array' }).Sheets['발주']['B2'].v === 7, '2차 저장 반영');
ok(sheetXmlOf(out2, wb2.sheets[0].path).includes('<f>D4*2</f>'), '2차 저장 후에도 수식 유지');

// ---- 5. 입력값 해석 -------------------------------------------------------
console.log('\n[5] 입력값 해석');
ok(Core.classify('123', null).kind === 'number', '"123" -> 숫자');
ok(Core.classify('0123', null).kind === 'string', '"0123" -> 문자열(앞 0 보존)');
ok(Core.classify('=A1+1', null).kind === 'formula', '"=A1+1" -> 수식');
ok(Core.classify('', null).kind === 'blank', '"" -> 빈 셀');
ok(Core.classify('010-1234-5678', null).kind === 'string', '전화번호 -> 문자열');
ok(Core.classify('1.5e3', null).kind === 'number', '지수표기 -> 숫자');
ok(Core.classify('2026-03-01', { isDate: true }).kind === 'date', '날짜 서식 셀 + 날짜 문자열 -> 날짜');
ok(Core.classify('2026-03-01', null).kind === 'string', '일반 셀 + 날짜 문자열 -> 문자열');
ok(Core.classify('한글 텍스트', null).kind === 'string', '한글 -> 문자열');

// ---- 6. 특수문자 / 유니코드 -----------------------------------------------
console.log('\n[6] 특수문자 · 공백 · 유니코드');
const wb3 = Core.parseWorkbook(out);
const tricky = 'a<b & "c" \'d\' 😀 한글  ';
const out3 = Core.writeWorkbook(wb3, [{ sheet: 0, row: 6, col: 1, text: tricky }]);
const wb4 = Core.parseWorkbook(out3);
ok(wb4.sheets[0].cells['6,1'].text === tricky, 'XML 특수문자/이모지/끝공백 왕복 성공');
ok(sheetXmlOf(out3, wb3.sheets[0].path).includes('xml:space="preserve"'), '끝 공백 보존 속성 부여');

console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
