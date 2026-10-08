# 배포 안내 (소규모 실사용 테스트)

서버 한 대에 Docker로 올리는 구성입니다. 데이터는 SQLite 파일 하나와 업로드 폴더이므로 **디스크가 유지되는 서버**가 필요합니다. Vercel 같은 서버리스 환경에서는 데이터가 사라지므로 쓰지 않습니다.

## 준비물

| 항목 | 예시 | 비고 |
| --- | --- | --- |
| 서버 | 월 1~2만 원대 VPS (2 vCPU, 2GB 메모리, 디스크 40GB) | Ubuntu 24.04, Docker 설치 |
| 도메인 | office.example.com | 서버 IP로 A 레코드 연결 |
| 메일 발송 | Resend 계정 + 도메인 인증 | 무료 구간(하루 100통)으로 테스트 가능 |
| 운영자 정보 | 운영자 이름, 문의 연락처 | 개인정보 처리방침에 표시 |

## 처음 올리기

```bash
# 서버에서
git clone https://github.com/peak-marketing/office-app.git
cd office-app
cp config/environment.example .env               # 값 채우기 (아래 표)
docker compose up -d --build
docker compose logs -f app                        # "Ready"가 보이면 완료
```

`.env`에서 꼭 채울 값

| 변수 | 뜻 |
| --- | --- |
| `APP_URL` | `https://office.example.com` — 메일 링크에 쓰입니다 |
| `DOMAIN` | `office.example.com` — HTTPS 인증서를 받을 도메인 |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | 첫 실행 때 만들 운영자 계정(비밀번호 10자 이상). 운영자가 생긴 뒤에는 무시됩니다 |
| `RESEND_API_KEY`, `MAIL_FROM` | 이메일 알림. 비어 있으면 메일을 보내지 않고 운영자 화면의 ‘메일 발송 기록’에만 남깁니다 |
| `JUSO_API_KEY`, `JUSO_DETAIL_API_KEY` | 주소 검색과 동·층·호 조회의 서로 다른 승인키. 서버 환경 변수로만 설정합니다 |
| `DATA_GO_KR_KEY` | 건축HUB 건축물대장의 선택 동 정보·선택 호 전용면적 조회. 키 자체는 저장소에 포함되지 않습니다 |
| `OPERATOR_NAME`, `OPERATOR_CONTACT` | 개인정보 처리방침에 표시. 비어 있으면 화면에 미입력 경고가 나옵니다 |

운영 환경(`NODE_ENV=production`)에서는 **시연용 예시 데이터를 넣지 않습니다.** 업체와 사례는 운영자가 ‘업체 관리 → 업체 직접 등록’과 ‘소개·사례 관리’에서 올리거나, 업체가 파트너 입점 신청 후 직접 올립니다.

## 출시 전 확인

1. `https://도메인/health`가 `{"ok":true}`를 돌려준다.
2. 운영자로 로그인 → 요청 관리 화면 위에 ‘메일이 실제로 나가지 않는 상태’ 경고가 없다.
3. 개인정보 처리방침(`/privacy`)에 운영자 정보가 나오고, 보관 기간 문구를 운영자가 확인했다.
4. 업체 1곳을 등록해 비밀번호 설정 메일을 받아 본다.
5. 고객 계정으로 요청 1건을 넣고, 운영자가 테스트로 표시한 뒤 배정·견적까지 한 번 돌려 본다.

## 백업

```bash
docker compose exec app node scripts/backup.mjs     # data/backups/날짜/ 에 DB와 업로드 파일 복사
```

매일 한 번 실행되도록 서버의 cron에 넣고, `data/backups`를 다른 곳(외장 저장소 등)으로도 복사해 두세요. 30일이 지난 백업은 자동으로 지웁니다.

## 업데이트

```bash
git pull && docker compose up -d --build   # 데이터 볼륨은 그대로 유지됩니다
```

## 알아 둘 점

- 업체 응답 기한은 `RESPOND_HOURS`(참여 여부, 기본 48시간), `QUOTE_DAYS`(제안 제출, 기본 7일)로 바꿉니다. 기한이 지나면 운영자 화면에만 표시되고 자동으로 재배정하지 않습니다.
- 업로드 한 파일은 10MB까지, 한 번에 30MB까지 받습니다.
- 서버 한 대 구성이므로 동시에 수백 명이 쓰는 규모는 고려하지 않았습니다. 소규모 테스트용입니다.

AI 도면 인식은 서버 전용 `OPENAI_API_KEY`, 선택 모델은 `OPENAI_FLOORPLAN_MODEL`입니다. 기본 모델은 `gpt-5.4-2026-03-05`입니다. API 연결 확인과 고객 도면의 인식 정확도 검증은 별개입니다. 상세 범위는 `docs/ai-floorplans.md`를 보세요. 등록 도면은 `/admin/floorplans`에서 권한과 구조를 검토한 뒤 등록합니다.
