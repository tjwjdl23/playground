/**
 * public/excel-editor.html 의 외부 스크립트를 인라인해서
 * 어디로든 파일 하나만 보내면 되는 단일 HTML 을 만든다.
 *
 *   node scripts/build-standalone.mjs [출력경로]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public/excel-editor.html');
const OUT = process.argv[2] || path.join(ROOT, 'dist-standalone/excel-editor.html');

let html = fs.readFileSync(SRC, 'utf8');

html = html.replace(/<script src="\.\/([^"]+)"><\/script>/g, (_, rel) => {
  const file = path.join(ROOT, 'public', rel);
  let js = fs.readFileSync(file, 'utf8');
  // JS 안에 </script> 가 들어있으면 태그가 조기 종료된다.
  js = js.replace(/<\/script/gi, '<\\/script');
  return `<script>\n/* ${rel} */\n${js}\n</script>`;
});

if (/<script src=/.test(html)) throw new Error('인라인되지 않은 <script src> 가 남아 있습니다.');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`${path.relative(ROOT, OUT)} — ${(html.length / 1024).toFixed(0)} KB`);
