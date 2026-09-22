import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROMIUM_PATH || undefined;

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };

const PORT = 8932;
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
  { cwd: path.join(ROOT, 'public'), stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

// 설정 화면에서 값을 고르고, 만들어진 북마크 주소(javascript:…)를 꺼낸다.
async function bookmarklet(date, from, to) {
  await page.goto(`${BASE}/alishan-autofill.html`);
  await page.fill('#date', date);
  await page.dispatchEvent('#date', 'change');
  await page.selectOption('#from', from);
  await page.selectOption('#to', to);
  const href = await page.getAttribute('#bookmarklet', 'href');
  return decodeURIComponent(href.replace(/^javascript:/, ''));
}
// 북마크를 누른 것과 같게 실행하고, 도착역을 기다리는 최대 시간(3초)보다 조금 더 기다린다.
async function run(code) {
  await page.evaluate(c => (0, eval)(c), code);
  await page.waitForSelector('#__aliFillToast', { timeout: 5000 });
}
const toast = () => page.textContent('#__aliFillToast');

console.log('설정 화면');
{
  await page.goto(`${BASE}/alishan-autofill.html`);
  const d = new Date(); d.setDate(d.getDate() + 14);
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  ok(await page.inputValue('#date') === local, '기본 탑승일 = 오늘 + 14일 (로컬 날짜)');
  await page.selectOption('#to', 'chiayi');
  ok(!(await page.getAttribute('#bookmarklet', 'href')), '출발역 = 도착역이면 북마크를 만들지 않음');
  ok((await page.textContent('#error')).includes('같습니다'), '같은 역 오류 표시');
}

console.log('연습 화면 (텍스트 날짜 칸 + 도착역 목록이 늦게 채워짐)');
{
  const code = await bookmarklet('2026-10-05', 'chiayi', 'alishan');
  await page.goto(`${BASE}/alishan-autofill-practice.html`);
  await run(code);
  ok(await page.inputValue('#rideDate') === '2026/10/05', '탑승일 2026/10/05 (placeholder 형식 따라 / 구분)');
  ok(await page.inputValue('#startStation') === '01', '출발역 嘉義');
  ok(await page.inputValue('#endStation') === '06', '도착역 阿里山 (목록 재로딩 후)');
  ok(await page.inputValue('#qty') === '1', '매수는 건드리지 않음');
  ok(await page.evaluate(() => document.activeElement.id) === 'validCode', '커서가 인증문자 칸으로 이동');
  ok(await page.inputValue('#validCode') === '', '인증문자는 입력하지 않음');
  ok(await page.textContent('#result') === '', '[다음] 버튼을 누르지 않음');
  ok(!(await toast()).includes('직접 선택'), '안내창: 모두 채움');
}

console.log('영문 화면, 라벨 없이 순서로만 구분, input[type=date], 역방향');
{
  const code = await bookmarklet('2026-10-06', 'alishan', 'fenqihu');
  await page.setContent(`
    <input type="date" id="d">
    <select id="a"><option>Chiayi</option><option>Fenqihu</option><option>Alishan</option></select>
    <select id="b"><option>Chiayi</option><option>Fenqihu</option><option>Alishan</option></select>`);
  await run(code);
  ok(await page.inputValue('#d') === '2026-10-06', 'date 칸 2026-10-06');
  ok(await page.$eval('#a', s => s.options[s.selectedIndex].text) === 'Alishan', '앞 select = 출발 Alishan');
  ok(await page.$eval('#b', s => s.options[s.selectedIndex].text) === 'Fenqihu', '뒤 select = 도착 Fenqihu');
}

console.log('도착 칸이 화면상 먼저 나와도 라벨로 구분, 날짜는 드롭다운');
{
  const code = await bookmarklet('2026-10-07', 'zhuqi', 'shizilu');
  const opts = '<option>嘉義站</option><option>竹崎站</option><option>奮起湖站</option><option>十字路站</option>';
  await page.setContent(`
    <select id="day"><option value="20261006">2026/10/06(二)</option><option value="20261007">2026/10/07(三)</option></select>
    <div><label for="arr">到達站</label><select id="arr">${opts}</select></div>
    <div><label for="dep">出發站</label><select id="dep">${opts}</select></div>`);
  await run(code);
  ok(await page.inputValue('#day') === '20261007', '날짜 드롭다운 2026/10/07 선택');
  ok(await page.$eval('#dep', s => s.options[s.selectedIndex].text) === '竹崎站', '出發站 = 竹崎站');
  ok(await page.$eval('#arr', s => s.options[s.selectedIndex].text) === '十字路站', '到達站 = 十字路站');
}

console.log('못 찾는 경우는 채우지 않고 안내만');
{
  const code = await bookmarklet('2026-12-25', 'chiayi', 'zhushan');
  await page.setContent(`
    <select id="day"><option>2026/10/06</option></select>
    <select id="a"><option>嘉義</option><option>阿里山</option></select>
    <select id="b"><option>嘉義</option><option>阿里山</option></select>`);
  await run(code);
  const t = await toast();
  ok(t.includes('탑승일') && t.includes('직접 선택'), '열리지 않은 날짜 → 직접 선택 안내');
  ok(t.includes('도착역: 목록에 祝山 없음'), '목록에 없는 역 → 직접 선택 안내');
  ok(await page.inputValue('#day') === '2026/10/06', '날짜 드롭다운은 그대로');
  ok(await page.$eval('#b', s => s.options[s.selectedIndex].text) === '嘉義', '도착 select 는 그대로');
}

ok(errors.length === 0, '페이지 오류 없음' + (errors.length ? ': ' + errors.join(' | ') : ''));

await browser.close();
server.kill();
console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
