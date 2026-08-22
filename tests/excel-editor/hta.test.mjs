/**
 * HTA(오프라인) 버전 테스트.
 *
 * mshta/IE 는 이 환경에서 실행할 수 없으므로, HTA 가 쓰는 Windows 전용 객체
 * (ADODB.Stream · Scripting.FileSystemObject · VBArray)를 메모리 상의 가짜 디스크로
 * 대신 구현해 Chromium 에서 돌린다. 이렇게 하면
 *   바이트 -> iso-8859-1 문자열 -> 바이트 왕복,
 *   임시 파일 저장 -> 재확인 -> 백업 -> 원본 교체
 * 같은 저장 경로 전체를 실제로 실행해 검증할 수 있다.
 * (IE 엔진 자체의 호환성은 scripts/check-ie-compat.mjs 가 따로 본다.)
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as fflate from 'fflate';
import XLSX from 'xlsx';
import { makeFixture } from './fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROMIUM_PATH || undefined;
const SERVE = path.join(ROOT, 'tests/excel-editor/.hta-tmp');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };

// 빌드된 단일 파일 HTA 를 .html 로 복사해 Chromium 이 열 수 있게 한다.
fs.mkdirSync(SERVE, { recursive: true });
const built = path.join(SERVE, 'editor.html');
spawn; // (no-op, keeps import used below explicit)
const { execFileSync } = await import('child_process');
execFileSync(process.execPath, [
  path.join(ROOT, 'scripts/build-standalone.mjs'),
  built,
  path.join(ROOT, 'hta/excel-editor.hta.html'),
], { stdio: 'pipe' });

const PORT = 8937;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
  { cwd: SERVE, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const FILE = 'C:\\공유\\발주서.xlsx';
const fixture = makeFixture();
const b64 = Buffer.from(fixture).toString('base64');

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });

// --- Windows 전용 객체를 흉내내는 가짜 디스크 --------------------------------
await page.addInitScript(({ b64, FILE }) => {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  window.__disk = {};              // 경로 -> Uint8Array
  window.__disk[FILE] = bin;
  window.__ops = [];               // 파일 조작 순서 기록

  window.VBArray = function (arr) { this.toArray = function () { return arr; }; };

  window.ActiveXObject = function (name) {
    if (name === 'ADODB.Stream') {
      return {
        Type: 1, Charset: '', Position: 0, _buf: null, _text: null,
        Open() {},
        Close() {},
        LoadFromFile(p) {
          const f = window.__disk[p];
          if (!f) throw new Error('파일을 찾을 수 없습니다: ' + p);
          this._buf = f;
          window.__ops.push('read:' + p);
        },
        Read() { return Array.prototype.slice.call(this._buf); },
        WriteText(s) { this._text = s; },
        SaveToFile(p) {
          // iso-8859-1 문자열을 바이트로 되돌린다 (HTA 가 기대하는 1:1 대응).
          const s = this._text || '';
          const out = new Uint8Array(s.length);
          for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            if (c > 255) throw new Error('255 를 넘는 문자가 들어갔습니다: ' + c);
            out[i] = c;
          }
          window.__disk[p] = out;
          window.__ops.push('write:' + p);
        }
      };
    }
    if (name === 'Scripting.FileSystemObject') {
      return {
        FileExists(p) { return Object.prototype.hasOwnProperty.call(window.__disk, p); },
        DeleteFile(p) { delete window.__disk[p]; window.__ops.push('delete:' + p); },
        CopyFile(a, b) { window.__disk[b] = window.__disk[a]; window.__ops.push('copy:' + a + '->' + b); },
        MoveFile(a, b) {
          window.__disk[b] = window.__disk[a];
          delete window.__disk[a];
          window.__ops.push('move:' + a + '->' + b);
        }
      };
    }
    throw new Error('지원하지 않는 객체: ' + name);
  };
}, { b64, FILE });

await page.goto(`http://127.0.0.1:${PORT}/editor.html`);

const readDisk = async (p) => {
  const arr = await page.evaluate((q) => window.__disk[q] ? Array.from(window.__disk[q]) : null, p);
  return arr ? new Uint8Array(Buffer.from(arr)) : null;
};

console.log('\n[HTA-1] 경로로 파일 열기');
await page.fill('#path', FILE);
await page.click('#openpath');
await page.waitForSelector('#app:not(.hide)');
const cellText = (r, c) => page.textContent(`td[data-row="${r}"][data-col="${c}"]`);
ok(await cellText(1, 1) === '이름', 'A1 = 이름');
ok(await cellText(2, 4) === '2500', 'D2 = 2500 (수식 결과)');
ok(await cellText(2, 5) === '2026-01-15', 'E2 날짜 표시');
ok((await page.getAttribute('#status', 'class')).includes('st-ok'), '열기 성공 상태');
ok(await page.isDisabled('#save'), '수정 전 저장 비활성');

console.log('\n[HTA-2] 셀 편집');
async function type(r, c, text) {
  const sel = `td[data-row="${r}"][data-col="${c}"]`;
  await page.click(sel);
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}
await page.click('td[data-row="2"][data-col="4"]');
ok(await cellText(2, 4) === '=B2*C2', '수식 셀은 수식 자체를 보여줌');
await page.keyboard.press('Escape');
await type(2, 2, '99');
await type(3, 1, '와셔');
await type(5, 1, '신규행');
ok((await page.textContent('#dirty')).includes('3개 셀'), '수정 개수: ' + await page.textContent('#dirty'));

console.log('\n[HTA-3] 저장 — 임시 파일 → 검증 → 백업 → 교체');
await page.evaluate(() => { window.__ops = []; });
await page.click('#save');
await page.waitForFunction(() => document.getElementById('status').className.indexOf('st-ok') >= 0);
ok((await page.textContent('#status')).indexOf('저장했습니다') === 0, '상태: ' + await page.textContent('#status'));

const ops = await page.evaluate(() => window.__ops);
const tmp = FILE + '.saving.tmp';
ok(ops[0] === 'write:' + tmp, '① 임시 파일에 먼저 쓴다: ' + ops[0]);
ok(ops[1] === 'read:' + tmp, '② 임시 파일을 다시 읽어 검증한다: ' + ops[1]);
ok(ops.indexOf('copy:' + FILE + '->' + FILE + '.bak') >= 0, '③ 원본을 .bak 으로 백업한다');
ok(ops.indexOf('move:' + tmp + '->' + FILE) >= 0, '④ 임시 파일을 원본 자리로 옮긴다');
ok(ops.indexOf('delete:' + tmp) < 0, '임시 파일이 남지 않는다');

const saved = await readDisk(FILE);
ok(saved !== null, '원본 경로에 파일이 있다');
const rt = XLSX.read(saved, { type: 'array' });
ok(rt.Sheets['발주']['B2'].v === 99, '저장된 파일: B2 = 99');
ok(rt.Sheets['발주']['A3'].v === '와셔', '저장된 파일: A3 = 와셔');
ok(rt.Sheets['발주']['A5'].v === '신규행', '저장된 파일: A5 = 신규행');
const sheetXml = fflate.strFromU8(fflate.unzipSync(saved)['xl/worksheets/sheet1.xml']);
ok(sheetXml.includes('<f>B2*C2</f><v>2500</v>'), '건드리지 않은 수식·캐시값 보존');
const bak = await readDisk(FILE + '.bak');
ok(bak !== null && Buffer.compare(Buffer.from(bak), Buffer.from(fixture)) === 0, '.bak 은 편집 전 원본과 동일');

console.log('\n[HTA-4] 바이트 왕복 (한글·이모지·이진값)');
ok(saved.length > 0 && saved[0] === 0x50 && saved[1] === 0x4b, '저장된 파일이 zip 시그니처(PK)로 시작');
await type(6, 1, '가나다 😀 <&>"');
await page.click('#save');
await page.waitForFunction(() => document.getElementById('status').className.indexOf('st-ok') >= 0);
const saved2 = await readDisk(FILE);
const wb2 = XLSX.read(saved2, { type: 'array' });
ok(wb2.Sheets['발주']['A6'].v === '가나다 😀 <&>"', '유니코드·특수문자 왕복: ' + wb2.Sheets['발주']['A6'].v);

console.log('\n[HTA-5] 검증 실패 시 원본 보호');
await page.evaluate(() => {
  // 디스크가 깨진 바이트를 돌려주는 상황을 흉내낸다.
  const orig = window.ActiveXObject;
  window.ActiveXObject = function (name) {
    const o = orig(name);
    if (name === 'ADODB.Stream') {
      const load = o.LoadFromFile.bind(o);
      o.LoadFromFile = function (p) { load(p); if (/tmp$/.test(p)) this._buf = new Uint8Array([1, 2, 3]); };
    }
    return o;
  };
});
const before = await readDisk(FILE);
await type(7, 1, '검증실패테스트');
await page.click('#save');
await page.waitForSelector('#notice:not(.hide)');
const warn = await page.textContent('#notice');
ok(warn.includes('검증'), '검증 실패를 알린다: ' + warn.trim().slice(0, 40) + '…');
const after = await readDisk(FILE);
ok(Buffer.compare(Buffer.from(before), Buffer.from(after)) === 0, '원본 파일은 전혀 바뀌지 않았다');
ok((await page.textContent('#dirty')).includes('개 셀'), '수정 내용이 화면에 남아 있다');

console.log('\n[HTA-6] 실행 위치(보안 구역) 판별');
{
  const cases = await page.evaluate(() => {
    const I = window.__htaInternals;
    return {
      unc: I.path('file://10.1.5.20/%EC%8B%A0%EA%B2%BD%EC%99%B8%EA%B3%BC/%EA%B3%A0%EC%84%9C%EC%A0%95/x.hta'),
      uncIsNet: I.isNetwork('file://10.1.5.20/a/b.hta'),
      local: I.path('file:///C:/Users/hong/Desktop/%EC%97%91%EC%85%80%ED%8E%B8%EC%A7%91%EA%B8%B0.hta'),
      localIsNet: I.isNetwork('file:///C:/Users/hong/Desktop/x.hta'),
      httpIsNet: I.isNetwork(location.href)
    };
  });
  ok(cases.unc === '\\\\10.1.5.20\\신경외과\\고서정\\x.hta', 'UNC 경로 복원: ' + cases.unc);
  ok(cases.uncIsNet === true, '네트워크 실행으로 판정');
  ok(cases.local === 'C:\\Users\\hong\\Desktop\\엑셀편집기.hta', '로컬 경로 복원: ' + cases.local);
  ok(cases.localIsNet === false, '로컬 실행은 제한 대상 아님');
  ok(cases.httpIsNet === false, 'http 로 연 경우도 제한 대상 아님');
}

ok(errors.length === 0, '자바스크립트 오류 없음' + (errors.length ? ': ' + errors.join(' | ') : ''));

await browser.close();
server.kill();
fs.rmSync(SERVE, { recursive: true, force: true });
console.log('\n결과: ' + pass + ' 통과, ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
