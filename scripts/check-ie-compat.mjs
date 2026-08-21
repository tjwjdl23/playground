/**
 * HTA 는 IE 엔진에서 돌기 때문에 최신 문법·API 가 하나라도 섞이면 그냥 죽는다.
 * 여기서 못 쓰는 것들을 정적으로 걸러낸다. 주석은 검사 대상에서 뺀다.
 *
 *   node scripts/check-ie-compat.mjs <파일>
 */
import fs from 'fs';

const file = process.argv[2];
if (!file) { console.error('사용법: node scripts/check-ie-compat.mjs <파일>'); process.exit(2); }
const src = fs.readFileSync(file, 'utf8');

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

// 이 도구가 직접 쓴 코드 구간만 본다 (인라인된 vendor 는 이미 ES5 로 확인됨).
// 주석을 먼저 지운 뒤 자른다 — 거꾸로 하면 여는 /* 가 잘려 주석이 코드로 잡힌다.
const clean = stripComments(src);
const appStart = clean.indexOf('<script type="text/javascript">');
const app = appStart >= 0 ? clean.slice(appStart) : clean;
const css = stripComments(src.slice(src.indexOf('<style>'), src.indexOf('</style>')));

const jsChecks = {
  '화살표 함수 =>': /=>/,
  'const 선언': /\bconst\s+\w/,
  'let 선언': /\blet\s+\w/,
  'class 선언': /\bclass\s+\w+\s*\{/,
  '템플릿 문자열': /`/,
  'element.dataset': /\.dataset\b/,
  'element.closest()': /\.closest\(/,
  'Promise': /\bPromise\b/,
  'classList': /\.classList\b/,
  'new Map / new Set': /\bnew\s+(Map|Set)\(/,
  'Object.assign': /Object\.assign/,
  'Array.from': /Array\.from/,
  '.includes()': /\.includes\(/,
  '.startsWith()': /\.startsWith\(/,
  '.padStart()/.repeat()': /\.padStart\(|\.repeat\(/,
  'Blob / URL.createObjectURL': /\bnew Blob\(|URL\.createObjectURL/,
  '기본 매개변수/전개': /\.\.\.\w/,
};
const cssChecks = {
  'CSS 변수 var(--x)': /var\(--/,
  'position: sticky': /position:\s*sticky/,
  'prefers-color-scheme': /prefers-color-scheme/,
  'display: flex': /display:\s*flex/,
  'display: grid': /display:\s*grid/,
};

const bad = [];
for (const [name, re] of Object.entries(jsChecks)) if (re.test(app)) bad.push('앱 코드: ' + name);
for (const [name, re] of Object.entries(cssChecks)) if (re.test(css)) bad.push('CSS: ' + name);

if (bad.length) {
  console.log('IE 호환성 검사 실패:');
  bad.forEach((b) => console.log('  ✗ ' + b));
  process.exit(1);
}
console.log('✓ IE 호환성 정적 검사 통과 — ES5 문법만, IE 미지원 API 없음, CSS 변수/sticky/flex 없음');
console.log('  파일: ' + file + ' (' + Math.round(Buffer.byteLength(src) / 1024) + ' KB)');
