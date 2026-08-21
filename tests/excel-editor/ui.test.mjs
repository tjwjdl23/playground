import { chromium } from 'playwright';
import { spawn } from 'child_process';
import * as fflate from 'fflate';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeFixture } from './fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROMIUM_PATH || undefined;

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };

const PORT = 8931;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
  { cwd: path.join(ROOT, 'public'), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const fixture = makeFixture();
const b64 = Buffer.from(fixture).toString('base64');

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => {
  // 테스트용 정적 서버의 favicon 404 는 무시
  if (m.type() === 'error' && !/404/.test(m.text())) errors.push('console: ' + m.text());
});
page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ': ' + r.url()); });

// 파일 선택 대화상자를 가짜 핸들로 대체한다 (원본 파일 덮어쓰기 경로를 그대로 실행).
await page.addInitScript(({ b64 }) => {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  window.__disk = bin;             // "디스크 위의 파일"
  window.__writes = 0;
  window.__pickerCalls = 0;
  const handle = {
    name: '발주서.xlsx',
    getFile: async () => new File([window.__disk], '발주서.xlsx'),
    queryPermission: async () => 'granted',
    createWritable: async () => {
      const chunks = [];
      return {
        write: async (d) => { chunks.push(d); },
        close: async () => {
          const total = chunks.reduce((n, c) => n + c.length, 0);
          const out = new Uint8Array(total);
          let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
          window.__disk = out;      // 원본 파일 자리에 덮어쓰기
          window.__writes++;
        }
      };
    }
  };
  window.showOpenFilePicker = async () => { window.__pickerCalls++; return [handle]; };
}, { b64 });

await page.goto(`http://127.0.0.1:${PORT}/excel-editor.html`);

console.log('\n[UI-1] 파일 열기 & 표 그리기');
await page.click('#open');
await page.waitForSelector('#app:not(.hidden)');
ok(await page.textContent('#filename') === '발주서.xlsx', '파일명 표시');
const tabs = await page.$$eval('#tabs button', els => els.map(e => e.textContent));
ok(tabs.join(',') === '발주,기타', '시트 탭: ' + tabs.join(', '));
const cellText = (r, c) => page.textContent(`td[data-row="${r}"][data-col="${c}"]`);
ok(await cellText(1, 1) === '이름', 'A1 = 이름');
ok(await cellText(2, 2) === '10', 'B2 = 10');
ok(await cellText(2, 4) === '2500', 'D2 = 2500 (수식 결과)');
ok(await cellText(2, 5) === '2026-01-15', 'E2 = 2026-01-15 (날짜)');
ok(await page.getAttribute('td[data-row="2"][data-col="4"]', 'class') === 'formula', 'D2 수식 셀로 표시');
ok(await page.isDisabled('#save'), '수정 전에는 저장 버튼 비활성');

console.log('\n[UI-2] 셀 편집');
async function type(r, c, text) {
  const sel = `td[data-row="${r}"][data-col="${c}"]`;
  await page.click(sel);
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await page.keyboard.press('Escape' === text ? 'Escape' : 'Enter');
}
await page.click('td[data-row="2"][data-col="4"]');
ok(await cellText(2, 4) === '=B2*C2', '수식 셀 클릭 시 수식 자체를 보여줌');
await page.keyboard.press('Escape');
ok(await cellText(2, 4) === '2500', 'Esc 로 결과값 표시 복원');

await type(2, 2, '99');
await type(3, 1, '와셔');
await type(2, 5, '2026-03-01');
await type(5, 1, '신규행');
await type(5, 4, '=D4*2');
ok((await page.textContent('#dirty')).includes('5개 셀 수정됨'), '수정 개수 표시: ' + await page.textContent('#dirty'));
ok((await page.getAttribute('td[data-row="2"][data-col="2"]', 'class') || '').includes('edited'), '수정 셀 강조');
ok(!(await page.isDisabled('#save')), '저장 버튼 활성화');

console.log('\n[UI-3] 원본 파일에 저장');
await page.click('#save');
await page.waitForFunction(() => window.__writes === 1);
ok(await page.evaluate(() => window.__pickerCalls) === 1, '저장 시 파일 선택 창이 다시 뜨지 않음 (picker 호출 1회뿐)');
ok((await page.textContent('#status')).startsWith('저장했습니다'), '상태: ' + await page.textContent('#status'));
ok(await page.isDisabled('#save'), '저장 후 저장 버튼 비활성');
ok((await page.getAttribute('#dirty', 'class')).includes('hidden'), '저장 후 미저장 배지 사라짐');
ok(await cellText(2, 2) === '99', '저장 후 화면에 새 값 유지');

const saved = Buffer.from(await page.evaluate(() => Array.from(window.__disk)));
const savedU8 = new Uint8Array(saved);
const rt = XLSX.read(savedU8, { type: 'array', cellDates: true });
ok(rt.Sheets['발주']['B2'].v === 99, '파일 내용: B2 = 99');
ok(rt.Sheets['발주']['A3'].v === '와셔', '파일 내용: A3 = 와셔');
ok(rt.Sheets['발주']['A5'].v === '신규행', '파일 내용: A5 = 신규행');
const e2 = rt.Sheets['발주']['E2'].v;
ok((e2 instanceof Date ? e2.toISOString().slice(0, 10) : String(e2)) === '2026-03-01', '파일 내용: E2 = 2026-03-01');
ok(rt.Sheets['기타']['A2'].v === '건드리지 않는 시트', '파일 내용: 다른 시트 보존');
const files = fflate.unzipSync(savedU8);
ok(fflate.strFromU8(files['xl/worksheets/sheet1.xml']).includes('<f>D4*2</f>'), '파일 내용: D5 수식 저장');
ok(fflate.strFromU8(files['xl/media/image1.bin']) === 'BINARY-BLOB-예제', '파일 내용: 알 수 없는 파트 보존');
const orig = fflate.unzipSync(fixture);
ok(Buffer.compare(Buffer.from(files['xl/styles.xml']), Buffer.from(orig['xl/styles.xml'])) === 0, '파일 내용: styles.xml 그대로');

console.log('\n[UI-4] 연속 저장 (같은 핸들 재사용)');
await type(3, 2, '77');
await page.click('#save');
await page.waitForFunction(() => window.__writes === 2);
ok(await page.evaluate(() => window.__pickerCalls) === 1, '두 번째 저장에서도 파일 선택 창 없음');
const saved2 = new Uint8Array(Buffer.from(await page.evaluate(() => Array.from(window.__disk))));
const rt2 = XLSX.read(saved2, { type: 'array' });
ok(rt2.Sheets['발주']['B3'].v === 77, '2차 저장 반영: B3 = 77');
ok(rt2.Sheets['발주']['B2'].v === 99, '2차 저장 후에도 1차 수정 유지: B2 = 99');
ok(fflate.strFromU8(fflate.unzipSync(saved2)['xl/worksheets/sheet1.xml']).includes('<f>SUM(D2:D3)</f>'), '2차 저장 후에도 원본 수식 유지');

console.log('\n[UI-5] 변경 취소 / 탭 전환');
await type(1, 1, '바뀐제목');
page.once('dialog', d => d.accept());
await page.click('#revert');
ok(await cellText(1, 1) === '이름', '변경 취소로 원래 값 복원');
await page.click('#tabs button:nth-child(2)');
ok(await cellText(2, 1) === '건드리지 않는 시트', '두 번째 시트 표시');
await page.click('#tabs button:nth-child(1)');
ok(await cellText(2, 2) === '99', '첫 시트로 복귀');

ok(errors.length === 0, '자바스크립트 오류 없음' + (errors.length ? ': ' + errors.join(' | ') : ''));

await browser.close();
server.kill();
console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
