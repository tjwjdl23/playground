/**
 * 외부 스크립트를 인라인해서, 파일 하나만 건네면 되는 단일 파일을 만든다.
 * 브라우저용 HTML 과 오프라인 HTA 둘 다 이 스크립트로 만든다.
 *
 *   node scripts/build-standalone.mjs [출력경로] [원본경로]
 *
 * 원본을 생략하면 public/excel-editor.html 을 쓴다.
 * <script src="./..."> 는 public/ 기준으로 찾아서 본문에 박아 넣는다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(ROOT, 'public/excel-editor.html');
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
