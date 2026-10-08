# 주거 1차 통합(3100 반영)과 되돌리기 절차

사무실 테스트 서버(`platform`, http://localhost:3100, 데이터 `platform/data`)에 주거 1차(`platform-home`)를 합치는 절차입니다. 아래 명령과 확인은 2026-10-02 실제 데이터 사본으로 리허설해 검증했습니다(결과: `output/home-integration-20261002/`).

- 코드 차이: 기준 버전(사무실 테스트 기준) 대비 추가 23개·수정 50개·삭제 0개 파일과 문서, 의존 패키지 변화 없음.
- 데이터 변화: 표 3곳에 칸 추가(`projects.kind` 기본 office, `vendors.fields` 기본 office, `versions.rooms` 빈 값). 기존 행·값은 바뀌지 않음. 선택 단계인 주거 준비로 집 예시 5건(사례·사진 10장)과 예시 업체 2곳의 ‘주거’ 분야가 더해짐.
- 예상 중단 시간: 리허설에서 중지부터 시작까지 1분 안팎(빌드 포함). 대면 테스트가 없는 시간에 합니다.

경로 줄임: `P=~/Desktop/인테러이 도면/platform`, `H=~/Desktop/인테러이 도면/platform-home`.

## 반영

1. **사전 확인**(서버 켠 채)
   - `cd "$H" && git status --short` 이 비어 있고, `git log -1`이 반영할 커밋인지 확인합니다.
   - `cd "$P" && npm run serve:status` 로 3100이 켜져 있는지 확인합니다.
2. **반영 전 백업**: `npm run data:backup -- before-home-integration` → 출력된 백업 이름을 적어 둡니다. `npm run data:verify -- <백업 이름>` 으로 점검합니다.
3. **서버 중지**: `npm run serve:stop`
4. **이전 코드 보관**(빌드 포함, 데이터 제외, APFS 복제라 빠름):
   ```sh
   mkdir "$P-before-home"
   cd "$P" && for f in $(ls -A); do [ "$f" = data ] || cp -cR "$f" "$P-before-home/"; done
   ```
5. **코드 반영**: 먼저 `-n`(미리보기)으로 지울 파일이 0개인지 확인한 뒤 실행합니다.
   ```sh
   rsync -a --delete --exclude /data/ --exclude /node_modules/ --exclude '/.next*/' --exclude /.git/ \
     --exclude '.env*' --exclude tsconfig.tsbuildinfo --exclude next-env.d.ts "$H/" "$P/"
   ```
6. **빌드**: `cd "$P" && npm run build`
7. **주거 준비**(서버가 멈춘 상태): `npm run data:home-setup -- --dry-run` 으로 확인한 뒤 `npm run data:home-setup -- --yes`. 새 칸은 미리보기 때 붙고, 실행하면 자체 백업(`…-before-home-setup`)을 만든 뒤 집 예시 5건과 예시 업체 ‘주거’ 분야를 더합니다. 한 번 더 실행해도 바뀌는 것이 없습니다.
8. **시작**: `npm run serve:start` → http://localhost:3100/health 가 200인지 봅니다.
9. **반영 확인**(5분)
   - 고객(customer@demo.kr): 기존 프로젝트 1·2의 한눈에·제안 비교·요청 내용·인쇄가 열리고 ‘사무실’로 표시됩니다.
   - 운영자: 요청 관리 목록과 프로젝트 2 상세가 열립니다. 업체 관리에 ‘분야 사무실·주거’가 보입니다.
   - 업체(vendor1~3): 요청 화면이 열립니다.
   - 공간 탐색은 19곳(사무실 14 + 집 5)이고, ‘집 상담 신청’ 화면이 열립니다.
   - 문제가 보이면 아래 되돌리기를 합니다.

## 되돌리기

먼저 집 요청이 생겼는지 봅니다: `sqlite3 -readonly "$P/data/app.db" "select count(*) from projects where kind='home'"`

### R1. 코드만 되돌리기 — 집 요청이 0건일 때

데이터는 그대로 둡니다. 새 칸 3개와 집 예시 5건이 남아도 이전 코드는 정상 동작합니다(리허설: 기존 화면 39개 오류 0, 집 예시 화면도 열림).

```sh
cd "$P" && npm run serve:stop
rsync -a --delete --exclude /data/ --exclude /node_modules/ --exclude '/.next*/' --exclude /.git/ \
  --exclude '.env*' --exclude tsconfig.tsbuildinfo --exclude next-env.d.ts "$P-before-home/" "$P/"
rm -rf "$P/.next" && cp -cR "$P-before-home/.next" "$P/.next"
npm run serve:start
```

공간 탐색에서 집 예시까지 없애려면 R2로 데이터도 되돌립니다.

### R2. 코드와 데이터 모두 되돌리기 — 집 요청이 생긴 뒤에도

집 요청이 있는 데이터를 이전 코드로 열면 집 요청이 ‘undefined평 사무실’처럼 잘못 보이고, 사무실용 ‘조건 변경’으로 집 요청을 덮어쓸 수 있습니다(리허설에서 확인). 그래서 데이터도 반영 전 백업으로 되돌립니다.

```sh
cd "$P" && npm run serve:stop
# 코드: R1과 같은 두 줄(rsync, .next 되돌리기)
npm run data:restore -- <before-home-integration 백업 이름> --yes
npm run serve:start
```

- `data:restore`는 되돌리기 직전 데이터를 `…-before-restore` 백업으로 먼저 남깁니다. 반영 뒤 들어온 요청·제안은 화면에서는 사라지지만 이 백업에 남아 있어 필요하면 옮길 수 있습니다.
- 리허설 결과: 되돌린 뒤 데이터 지문(DB·업로드)이 반영 직전과 같고, 기존 화면 39개 글자가 반영 전과 같았습니다.

## 다시 반영

되돌린 뒤 원인을 고쳤으면 ‘반영’ 1단계부터 다시 합니다(이전 코드 보관 폴더 `$P-before-home`은 지운 뒤 새로 만듭니다).
