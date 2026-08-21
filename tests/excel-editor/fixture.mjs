import XLSX from 'xlsx';
import * as fflate from 'fflate';
import fs from 'fs';

export function makeFixture() {
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
  const files = fflate.unzipSync(bytes);
  let xml = fflate.strFromU8(files['xl/worksheets/sheet1.xml']);
  xml = xml.replace('<f>B2*C2</f>', '<f>B2*C2</f><v>2500</v>')
           .replace('<f>B3*C3</f>', '<f>B3*C3</f><v>480</v>')
           .replace('<f>SUM(D2:D3)</f>', '<f>SUM(D2:D3)</f><v>2980</v>');
  files['xl/worksheets/sheet1.xml'] = fflate.strToU8(xml);
  files['xl/media/image1.bin'] = fflate.strToU8('BINARY-BLOB-예제');
  return fflate.zipSync(files, { level: 6 });
}

/** 압축에 시간이 걸릴 만큼 큰 워크북 (권한 요청 시점 회귀 테스트용) */
export function makeBigFixture() {
  const rows = [['라벨', '값', '비고']];
  for (let i = 1; i <= 6000; i++) rows.push(['항목-' + i, i * 3, '설명 텍스트 ' + i + ' 가나다라마바사']);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wbf = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbf, ws, '데이터');
  return new Uint8Array(XLSX.write(wbf, { type: 'array', bookType: 'xlsx', bookSST: true }));
}
