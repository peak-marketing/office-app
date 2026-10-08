# 개발자 인수인계 — 2026-10-08

## 먼저 알아둘 것

현재 개발 기준은 이 저장소의 `main`입니다. 루트의 `package.json`이 플랫폼 앱의 실행 시작점이며 `platform/` 하위 폴더로 들어가지 않습니다. 이전 로컬 `platform-next` 내용을 저장소 루트에 올렸습니다. 초기 독립 도면 생성기는 `reference/office-layout/`에 있습니다.

제품 방향은 **공간 탐색·커뮤니티 + 내 공간 3D + 비공개 경쟁입찰형 시공 매칭 + 가구·소품 입점 쇼핑**입니다. 프로젝트가 배치·시공 요청·상품 배치·완성 게시물을 연결합니다. 공간 만들기와 공사 요청은 별개이며 고객이 필요한 기능만 사용합니다.

기능 코드는 구현돼 있으나 외부 서비스와 실제 운영 검증까지 모두 끝난 상태는 아닙니다. GitHub에 코드를 올렸고 공개 서비스 서버는 아직 배포하지 않았습니다.

## 실행

Node.js 22.13 이상이 필요하며 Docker 구성은 Node 24를 사용합니다. 새 컴퓨터에서는 다음 순서로 시작합니다.

```sh
git clone git@github.com:peak-marketing/office-app.git
cd office-app
npm ci
cp config/environment.example .env.local
SEED_DEMO=1 COOKIE_SECURE=0 APP_URL=http://localhost:3000 npm run dev -- --hostname 127.0.0.1 --port 3000
```

실제 키를 받기 전에는 환경 변수 예시의 키를 비워 둡니다. 위 명령은 새 로컬 DB에 예시 계정과 자료를 만듭니다. 기존 운영 DB를 복사해서 시연을 시작하지 않습니다. `SEED_DEMO=0`이면 예시 데이터가 생기지 않으며, 빈 운영 DB의 첫 운영자는 `ADMIN_EMAIL`·`ADMIN_PASSWORD`(10자 이상)·`ADMIN_NAME`으로 생성됩니다.

시연 계정 비밀번호는 모두 `demo1234`입니다.

| 역할 | 계정 | 확인 경로 |
| --- | --- | --- |
| 고객 | `customer@demo.kr` | `/projects`, `/homes/new`, `/spaces/new`, `/shop`, `/community` |
| 시공사 | `vendor1@demo.kr`, `vendor2@demo.kr`, `vendor3@demo.kr` | `/vendor` |
| 판매자 | `seller@demo.kr` | `/seller` |
| 시공·판매 겸업 | `vendor1@demo.kr` | `/vendor`, `/seller` |
| 운영자 | `admin@demo.kr` | `/admin` |

운영 빌드·실행은 다음과 같습니다. 이전 로컬 환경에서 Webpack 빌드로 확인했습니다.

```sh
npm run build -- --webpack
PORT=3330 DATA_DIR="$PWD/data/handoff-demo" SEED_DEMO=1 COOKIE_SECURE=0 APP_URL=http://localhost:3330 npm run serve:start
npm run serve:status
```

같은 `PORT`·`DATA_DIR`를 지정해 `serve:stop`·`serve:restart`를 사용합니다. `serve` 명령은 데이터를 초기화하지 않습니다. 운영 배포는 [DEPLOY.md](DEPLOY.md)의 Docker·Caddy·지속 디스크 구성을 따릅니다.

## 기능과 주요 코드

| 영역 | 현재 구현 | 주요 위치 |
| --- | --- | --- |
| 탐색·모바일 | 공간 사례·필터·통합 검색·저장·역할별 메뉴·모바일 하단 탭 | `app/page.tsx`, `app/search/`, `components/explore/` |
| 사무실 | 치수·문·창·기둥 입력, 목적별 자동 배치, 평면·3D, 가구 이동·회전·크기·버전 | `lib/layout/`, `lib/space/`, `components/space/` |
| 주거 | 상담 신청, 방 한 칸 배치, 집 전체 외곽·내부 벽·문·창·방 구분·편집·3D | `lib/home.ts`, `lib/space/house*.ts`, `components/home/`, `components/house/` |
| 자료 입력 | 이미지·PDF 업로드, 축척 맞춤·따라 그리기, AI 인식과 원본 보정, 등록 도면 | `lib/floorplan/`, `components/space/`, `app/spaces/` |
| 주소 | 실제 주소 → 선택 동·층·호 → 건물 정보·전용면적 → 신청서에 명시적 불러오기 | `lib/address.ts`, `lib/building-api.ts`, `components/address/` |
| 시공 입찰 | 운영자 배정·승인 업체 직접 참여·업체 상한·견적/설계/자재/기간 제안·동일 기준 비교 | `lib/bidding.ts`, `lib/quotes.ts`, `lib/request-snapshot.ts`, `app/vendor/` |
| 커뮤니티 | 공간 소개·계약 확인 후기·상품 태그·좋아요·스크랩·댓글·신고·검수 | `lib/community*.ts`, `lib/post-refs.ts`, `app/community/` |
| 쇼핑 | 판매자 승인·상품 옵션/재고·장바구니·주문·결제 경로·배송·취소/교환/환불·정산 기록 | `lib/shop*.ts`, `lib/order-flow.ts`, `lib/refund-flow.ts`, `lib/exchanges.ts`, `app/seller/` |
| 상품 3D | SKU 규격 보관·공간에 배치·실제 모델 또는 규격 상자·장바구니 연결 | `lib/shop-place.ts`, `lib/space/product-snapshot.ts`, `app/place/` |
| 운영 | 권한·알림·메일 기록·업체/판매자 관리·백업·상태 확인 | `lib/auth.ts`, `lib/mailer.ts`, `lib/notify.ts`, `scripts/data.mjs`, `app/admin/` |

## 외부 서비스 실제 상태

실제 값은 서버 환경 변수로만 설정합니다. [config/environment.example](config/environment.example)은 변수명과 빈 설정 예시이며 실제 키는 프로젝트 책임자에게 별도로 전달받습니다.

| 서비스 | 환경 변수 | 확인 상태와 다음 작업 |
| --- | --- | --- |
| 도로명주소 검색 | `JUSO_API_KEY` | 실제 조회 확인. 새 운영 URL의 승인 조건도 확인 |
| 상세주소 동·층·호 | `JUSO_DETAIL_API_KEY` | 별도 승인키로 실제 조회 확인. 수록된 정보만 표시 |
| 건축HUB 건축물대장 | `DATA_GO_KR_KEY` | 선택 동 표제부·선택 호 전유면적 실제 조회 확인 |
| AI 도면 인식 | `OPENAI_API_KEY`, `OPENAI_FLOORPLAN_MODEL` | 실제 호출 구현·검사 완료. 복잡한 실제 도면의 정확도는 해결되지 않음 |
| 네이버 공식 웹 검색 | `NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET` | 선택 연동. 키 없는 상태에서는 등록 자료 검색 |
| 토스 결제·환불 | `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY` | 연결 코드와 테스트 결제 흐름 있음. 실제 가맹·승인·환불 검증 전 |
| Resend 메일 | `RESEND_API_KEY`, `MAIL_FROM` | 발송 코드 있음. 실제 발송·수신 검증 전; 미연결 때 발송 기록만 생성 |
| 사업자 상태 조회 | `DATA_GO_KR_KEY` | 건축물대장 확인과 별개. 실제 국세청 조회 검증 전, 서류 확인 방식 |
| 판매자 정산 지급 | 별도 지급대행 계약 필요 | 정산 계산·기록은 있음. 자동 지급 없음; 수동 이체 후 지급 완료 기록 |
| 배송 추적 | 현재 별도 키 없음 | 송장번호·조회 링크. 실시간 택배 이벤트 동기화 없음 |

주소 API가 평면도·벽 위치·동호별 타입까지 주는 것은 아닙니다. 실제 확인 사례는 갈매스타힐스 401동 1층 102호, 전유면적 74.94㎡입니다. 다른 건물의 수록을 보장하지 않습니다. 조회 실패 때는 직접 입력·도면 업로드로 이어지고 면적만으로 방 모양을 추측하지 않습니다.

갈매스타힐스 공개 기본형 7타입의 참고 자료가 있으나, 112A의 **AI 자동 인식은 실제 도면에서 실패**했습니다. 원본 대조 참고 배치가 별도로 있습니다. 다른 타입이나 확장형을 112A로 대체하면 안 됩니다. [AI 문서](docs/ai-floorplans.md)에서 연결 성공과 구조 정확도를 구분합니다.

`lib/external.ts`의 `verified`는 운영 연동 확인을 보수적으로 표시하며 현재 자동으로 확정하지 않습니다. 키가 있다는 사실과 실제 운영 검증 완료를 혼동하지 않습니다.

## 변경하면 안 되는 핵심 규칙

- 시공사는 서로의 가격·설계 제안을 보지 못합니다. 고객이 선택하고 최저가 자동 낙찰하지 않습니다.
- 업체는 고객이 **보낸 요청 기록**과 지정 배치 버전을 봅니다. 고객이 편집 중인 최신 상태를 바로 보여 주지 않습니다.
- 고객이 ‘변경 내용 보내기’를 누른 뒤 같은 업체에 새 기준을 전달합니다. 견적은 같은 요청 기준끼리 비교합니다.
- 최신 요청 기준을 기본으로 보여 주며 이전 기준은 따로 엽니다. ‘최저’는 비교 규칙을 만족할 때만 표시합니다.
- 상세 주소·동호·연락처는 현장 방문을 요청한 업체에만 공개합니다. 공유 링크·업체 참여 미리보기에는 공개하지 않습니다.
- 확인하지 못한 구조·면적·창 위치를 실제 값처럼 채우지 않습니다. 자동 검사 통과는 법규·시공 가능 판정이 아닙니다.
- 예시 사례·상품은 실제 판매·실제 시공 사진으로 표시하지 않습니다.

## 검사 실행

기능 회귀 소스·예시 도면은 이미 `tests/e2e/`에 포함돼 있습니다. 현재 맨 위의 실행 묶음은 19개입니다. 예전 복원본은 `tests/e2e/legacy/`에 있고, 임시 폴더에 남았던 비교 도구도 `tools/legacy-validation/`에 보관했습니다.

```sh
npx --no-install tsc --noEmit
npm run check:layouts
npm run check:space
npm run check:home
node --import tsx scripts/check-house.ts
npm run check:commerce
npm run check:floorplan
npm run check:floorplan-refine
npm run check:apartment
npm run check:address
npm run check:building
NEXT_DIST_DIR=.next-test npm run build -- --webpack
npm run test:e2e -- platform home shop community
npm run test:e2e
```

기존 E2E는 Mac의 Google Chrome 경로와 `sqlite3` CLI를 사용합니다. Linux·Windows의 자동 검사 환경을 만들 때 브라우저 경로를 공통 설정으로 바꾸는 후속 작업이 필요합니다. 실행기는 `.e2e-data/`에 격리 DB·서버를 만들며 실제 운영 데이터를 초기화하지 않습니다. 자세한 변수는 [검사 안내](tests/e2e/README.md)를 보세요.

`tests/live/`는 실제 공급자 연결·브라우저 검사입니다. 해당 검사의 환경 변수와 격리 DB 조건을 읽고 실행합니다. OpenAI를 실제 호출하는 검사는 사용료가 발생할 수 있으며 일반 회귀 검사는 AI 키를 끄고 고정 자료를 사용합니다.

최근 결과: 주소 계약 15, 건축물대장 계약 23, 실제 무료 API 6, 건물 정보 브라우저 21, 신청 연결 브라우저 41, 기존 주거·접수·플랫폼 회귀 241개 통과. 이는 해당 개발 시점의 검사 범위이며 실제 고객 사용성 검증 완료나 모든 실제 도면의 인식 성공을 뜻하지 않습니다. [검증 기록](docs/verification/README.md)을 함께 읽으세요.

## 데이터·배포

- SQLite 스키마와 보완은 `lib/db.ts`, `lib/db-v2.ts`; 새 DB는 최초 실행 때 생성됩니다.
- 시연 계정·사례·상품은 `lib/seed*.ts`, `seed-assets/`, `public/demo/`에 있어 운영 DB 없이 재현할 수 있습니다.
- DB와 고객 파일은 `DATA_DIR` 아래에 두고 서버의 지속 볼륨으로 보관합니다. 실제 키·DB·업로드는 Git 저장소에 없습니다.
- `npm run data:backup -- 이름`으로 먼저 백업합니다. 초기화/복구는 서버 중지와 `--yes`가 필요합니다.
- 공개 서버·도메인·HTTPS·실제 메일·PG·운영자 표시 정보·약관/개인정보 문구 확정이 아직 남아 있습니다.
- 이전 Mac의 3100은 과거 테스트 기준, 3344는 주소 신청 연결 미리보기였습니다. 새 개발자가 같은 포트를 띄운다고 그 데이터가 따라오는 것은 아닙니다.

## 다음 개발자가 진행할 작업

1. 새 clone에서 예시 데이터로 고객·시공사·판매자·운영자 흐름을 실행하고 기준 검사 결과를 남깁니다.
2. 실제 운영용 서버와 외부 키를 설정하고 결제·취소·환불·메일 수신을 확인합니다. 자동 정산 지급은 별도 범위입니다.
3. 실제 고객·업체·판매자 테스트로 입력/3D 편집/제안 비교/배송·반품 흐름을 검증합니다.
4. 실제 주거 도면 인식 정확도와 도면 확보 경로를 넓힙니다. 주소 조회는 도면 공급을 대신하지 않습니다.
5. 공장·부지·지식산업센터 등은 현재 집·사무실 접수 범위 밖입니다. 공간 구조·신청·견적 항목·참여 업체를 추가 설계합니다.

기획 문서는 `docs/v2-plan.md`, `docs/platform-status.md`, 주거·AI 문서에 있습니다. 이전 회차 설명과 오래된 로드맵은 이 인수인계의 현재 상태 및 실제 코드와 함께 판단합니다. 서비스 이름 ‘오피스매칭’과 수수료·참여 상한·신고 가림 같은 초기 기본값도 운영 정책으로 재검토해야 합니다.

## 함께 전달한 자료

현재 앱 전체 소스·잠금 파일·환경 변수 예시·Docker 구성·기획·테스트·시드 이미지/모델 외에 초기 도면 생성 소스와 HTML/PDF/GLB/SVG/PNG/ZIP를 `reference/office-layout/`에 추가했습니다. 파일 목록은 [docs/project-files.tsv](docs/project-files.tsv)에 있습니다. 중복된 과거 개발 폴더, 설치 패키지, 빌드 캐시, 실제 키·운영 DB·고객 파일·복구용 Git bundle은 저장소에 넣지 않았습니다. 현재 개발에는 `main` 한 버전을 사용합니다.
