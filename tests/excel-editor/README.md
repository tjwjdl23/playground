# 엑셀 편집기 테스트

`public/excel-editor.html` 과 `public/vendor/xlsx-core.js` 를 검증한다.
블로그 본체(Astro)와 의존성을 섞지 않으려고 이 폴더에 별도의 `package.json` 을 둔다.

```sh
cd tests/excel-editor
npm install
npm test          # core + UI 전부
npm run test:core # 파싱/저장 엔진만 (브라우저 불필요)
npm run test:ui   # Chromium 으로 실제 화면 조작
```

- **core.test.mjs** — `xlsx-core.js` 를 Node 에서 로드(`@xmldom/xmldom` 으로 DOMParser 대체)해
  읽기 · 편집 · 저장 · 재편집 왕복과 "수정하지 않은 파트는 바이트 그대로 보존" 을 확인한다.
- **hta.test.mjs** — 오프라인 HTA 버전. mshta/IE 를 여기서 돌릴 수 없으므로 Windows 전용 객체
  (`ADODB.Stream` · `Scripting.FileSystemObject` · `VBArray`)를 메모리 상의 가짜 디스크로 대신 구현해
  Chromium 에서 실행한다. 바이트 왕복과 **임시 파일 → 검증 → 백업 → 원본 교체** 순서,
  검증 실패 시 원본이 보존되는지까지 확인한다.
- **ui.test.mjs** — Playwright + Chromium 으로 페이지를 실제로 띄운다.
  `showOpenFilePicker` 를 메모리 상의 가짜 파일 핸들로 바꿔서, 파일 열기 → 셀 편집 →
  [저장] → **같은 핸들에 덮어쓰기** 전 과정을 그대로 실행하고 저장된 바이트를 검사한다.

`xlsx`(SheetJS) 는 테스트 픽스처를 만들고 결과를 교차 검증하는 용도로만 쓴다.
편집기 자체는 이 라이브러리를 쓰지 않는다.

IE 엔진 호환성(ES5 문법, IE 미지원 API, CSS 변수)은 별도로 정적 검사한다:

```sh
npm run check:ie
```

Chromium 경로를 직접 지정하려면 `CHROMIUM_PATH=/path/to/chrome npm run test:ui`.
