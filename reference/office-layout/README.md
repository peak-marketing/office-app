# 초기 30평 사무실 도면 생성 자료

처음 만든 11m × 9m, 직원 8석·대표실·회의실·탕비실의 가정 치수 예시입니다. 내추럴·시크·러블리는 같은 배치의 마감 비교입니다. 현재 플랫폼의 실제 사용자 입력 엔진은 저장소 루트의 `lib/layout/`, `lib/space/`, `components/`를 사용합니다.

## 포함 자료

- `source/`: 좌표·SVG 생성, 독립 HTML 뷰어, 이미지·GLB 출력, 인쇄·PDF 생성 코드와 검토 이미지.
- `output/`: 기존 HTML·SVG·PNG·PDF·GLB·JSON·전달 메모·ZIP 전체.
- `output/A_내추럴`, `B_시크`, `C_러블리`: 스타일별 결과물.

`output/00_3가지스타일_3D.html`은 별도 서버 없이 브라우저에서 열 수 있습니다. 결과물은 현장 실측 전 개념안입니다.

## 다시 생성하기

저장소 루트에서 `npm ci`를 실행하고 Python 3와 Chrome/Chromium을 설치합니다. Python 코드는 표준 라이브러리만 사용합니다. 아래 명령은 **이 폴더에서** 실행합니다.

```sh
python3 source/build.py
python3 source/variants.py
node source/render.cjs
node source/render-variants.cjs
python3 source/report-variants.py
node source/pdf-variants.cjs
```

처음 사용하던 `/tmp/office-layout-tools` 의존성을 제거했습니다. 브라우저 도구는 루트의 `playwright-core`를 사용하고 `source/browser.cjs`에서 설치된 Chrome을 찾습니다. 다른 위치에 설치했다면 `CHROME_PATH`를 지정합니다.

`source/viewer.bundle.js`는 이미 포함돼 있어 위 명령에 번들러 설치가 필요하지 않습니다. `source/viewer.js`를 수정했다면 저장소 루트에서 먼저 다시 묶습니다.

```sh
npm exec --yes --package=esbuild -- esbuild reference/office-layout/source/viewer.js --bundle --format=iife --outfile=reference/office-layout/source/viewer.bundle.js
```

PDF와 PNG의 한글 글꼴은 실행하는 컴퓨터의 설치 글꼴을 사용합니다. ZIP 파일은 원래 전달본이며 위 명령으로 자동 갱신되지 않습니다.
