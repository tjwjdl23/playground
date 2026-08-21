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
