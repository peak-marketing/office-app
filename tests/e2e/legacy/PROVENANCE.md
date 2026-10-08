# Legacy browser E2E scripts: where they came from

These scripts lived in the session scratchpad
`/private/tmp/claude-501/-Users-gimjinbong-Desktop--------/731f479b-8fe5-44a1-902c-3ab815fc5abf/scratchpad/`,
which was wiped by a reboot on 2026-10-05. They were rebuilt from the session transcript
`~/.claude/projects/-Users-gimjinbong-Desktop--------/731f479b-8fe5-44a1-902c-3ab815fc5abf.jsonl`.
This document calls that file "the transcript". Line numbers are jsonl line numbers and times are UTC.

**Result:** all 13 files below were recovered. Each one is byte-for-byte the last version in the transcript. No test logic was changed, and every file passes `node --check`.

## How they were rebuilt

1. **Collect the file operations.** Every tool call that created or changed one of these files was taken in transcript order:
   - `Write`
   - `cat > … <<'EOF'` heredocs
   - `sed -i ''`
   - inline `python3` replace scripts
   - `cp`

   The transcript repeats 111 tool calls at lines 2226–2670. They are copies made at compaction and carry the same `tool_use` ids, so they were ignored.
2. **Replay them in an empty folder.** Only the part of each Bash command that touched these files was run. Server restarts, test runs and edits to the app source were left out.
   - The python snippets ran unchanged, including their own `assert s.count(a)==1` guards. All of them passed.
   - The sed commands ran with macOS `/usr/bin/sed`, as in the original session.
3. **Check the results** in four ways:
   - **File-history backups.** For e2e8, e2e9, e2e10, e2e11, e2e12 and trace-verify, Claude Code kept copies in `~/.claude/file-history/731f479b-…/`. Every saved version matches the replay byte for byte (see the table).
   - **Full or partial file listings in the transcript** (`sed -n a,bp`, `cat | head`). Every listing matches the replay at that point in time.
   - **`grep -n` outputs** in the transcript. About 200 lines were compared and all match. The only mismatches came from greps over other files or from path display, not from these scripts.
   - **Saved test runs.** Every PASS/FAIL check name in `output/home-integration-20261002/e2e-fresh-head/*.out` and `output/home-phase1-20261002/e2e5.out` matches a `check(...)` in the recovered scripts. The counts are: e2e3b-h 47, e2e4b 33, e2e5 63, e2e5-h 63, e2e6 55, e2e8 80, e2e9 95, e2e10 17, e2e11 10, e2e12 38 and trace-verify 29.

An earlier memory note said e2e3b, e2e4b, e2e5, e2e6 and t8 "had no originals". That was wrong. Each of them was first created by a heredoc in this same transcript, and every later edit is also recorded there.

## Per-file record

| File | Status | Created | Edits replayed (line, time UTC, what changed) | Verified against |
| --- | --- | --- | --- | --- |
| `e2e3b.cjs` | recovered | Built from `e2e3.cjs`, which was created by heredoc at L527 (09-30 07:33), then edited by sed at L586 (stats regex) and L670 (`확정 금액 합계`→`현재 산정 금액`). e2e3b itself was produced by python at L1154 (09-30 10:06). | L1173 10:11 sed `시공 사례 3건`→`5건` · L1610 10-01 06:02 consent + dims step · L1614 06:02 partner consent · L2075 11:02 intake label click, case `LIKE`, `저장한 공간` · L2084 11:02 home/CTA/kind-example checks · L2088 11:04 drop aside check · L3818 10-02 04:24 `require("./t8.cjs")`, `/spaces/new` flow (makeSpace/requestSpace/designAsIs) · L5745 07:48 bulk sed for B/DB | Full listing L3775 + L3809 (state after L2088) identical; greps L1607, L2075, L2084, L3771, L4705, L5742, L7393, L7757, L7762; `diff e2e3b e2e3b-h` output at L8027 identical (lines 20, 116) |
| `e2e4b.cjs` | recovered | Built from `e2e4.cjs`, which was created by heredoc at L657 (09-30 08:45). e2e4b was produced by python at L1154. | L1610 consent + dims · L2075 intake/LIKE · L3839 10-02 04:27 makeSpace/requestSpace, `29.9평`, edit-then-send-update (r2) section · L3956 04:42 SQL read check, notification text · L3971 04:47 remove `goBack()` · L5745 bulk sed | Full listing L3831 (`sed -n 1,140p`, state after L2075) identical; greps L3963, L8597 |
| `e2e5.cjs` | recovered | Heredoc at L1180 (09-30 10:12) | L1192 sed `최저` count `=== 1`→`>= 1` · L1610 consent · L1614 dims intake · L1622 10-01 06:06 sed coverage text `입력한 치수로` · L2075 · L2084 home cards/filter chips/search counts/my-status · L2088 mobile CTA · L3881 10-02 04:32 `/spaces/new`, editor start chips, style picker, requestSpace, version rule · L5745 bulk sed | Listings L3848 (40–135) + L3863 (135–190) identical; greps L1590, L1607, L2075, L3702, L3771, L7757, L8164, L8167 |
| `e2e6.cjs` | recovered | Heredoc at L1594 (10-01 05:59) | L1603 06:01 no-layout/next-step fixes · L2075 · L3912 10-02 04:36 space builder flow (makeSpace/requestSpace/designAsIs, `kind='drawing'`) · L5745 bulk sed · L6329 09:33 P2: compare defaults to latest r2, r1 opened separately | Listings L3705 (105–135), L3900 (60–104, 134–200), L3908 (104–134) identical; greps L3702, L3771 |
| `e2e8.cjs` | recovered | `Write` L3720 (10-02 04:14) | L3728 04:14 dragId fix · L3754 04:16 pillar-issue click · L4714 05:45 sed no-auto text (`2,500mm 이내`) · L5745 bulk sed · L6236 09:23 P2 r2/r1 quote checks, `server.log` next to DB | file-history `93b453fe54218c15` v2/v3/v4/v5 identical; listings L4424, L6218 |
| `e2e9.cjs` | recovered | `Write` L4642 (10-02 05:38) | L4657 05:38 sed `/files`→`/info` · L4664 05:40 ±20mm tolerances · L4672 05:41 · L4974 06:03 L-shape request/vendor checks + `requestSpace` import · L4988 06:04 · L5186 06:25 scope/edge-preview/area/fixture wording · L5200 06:25 josa wording · L5241 06:33 sed `viewBox`→`data-image-size` · L5247 06:35 sed `1e-9`→`5e-5` · L5745 bulk sed | file-history `faebb0bc504f22e0` v2/v3/v4 identical; listing L5178 |
| `e2e10.cjs` | recovered | `Write` L5785 (10-02 07:53) | L5802 07:54 password-reset flow · L5986 08:29 proposal-wording checks · L5994 08:30 click 참여하기 first · L6976 11:18 sed `const P = process.env.P \|\| "…/platform"` | file-history `8df9b3ec1d404ced` v2/v3/v4 identical; post-edit grep L6976 |
| `e2e11.cjs` | recovered | `Write` L6297 (10-02 09:27) | none | file-history `f3e4980251f0cd68` v2 identical |
| `e2e12.cjs` | recovered | `Write` L6502 (10-02 10:09) | L6515 10:09 sed `seen.length >= 6`→`>= 5` · L6532 10:10 admin contract-result step | file-history `5d5e30f88579376e` v2 identical; listing L7441 (55–120); grep L7434 |
| `trace-verify.cjs` | recovered | `Write` L6136 (10-02 09:19) | none | file-history `173daed1e7a4d8b2` v2 identical |
| `t8.cjs` | recovered | Heredoc at L3818 (10-02 04:24) | none (never edited afterwards) | Full content printed at L4635 (`sed -n 1,80p`, 05:36) and L7434 (`cat \| head -80`, 11:31): both identical |
| `e2e3b-h.cjs` | recovered | L8027 (10-02 12:06): `cp e2e3b.cjs e2e3b-h.cjs`, then python | 14→19 cards, `이런 공간 어때요?`, 19 kind-example | `diff` output in the same command identical |
| `e2e5-h.cjs` | recovered | L8173 (10-02 12:11): `cp e2e5.cjs e2e5-h.cjs`, then python | 14→19 cards, first office card selector | `diff \| wc -l` = 4, same as transcript |

L5745 is the bulk sed run on every scratchpad `*.cjs` that contained `localhost:3100` or `platform/data/app.db`. It changed two lines:

- `"http://localhost:3100"` became `(process.env.B || "http://localhost:3101")`
- `"/Users/…/platform/data/app.db"` became `(process.env.DB || "<old scratchpad>/testdata/app.db")`

At L5757 `e2e8.cjs` was moved to `old/` because of a `3100` coordinate, and it was moved back unchanged at L5762.

L4974 also edited `review10.tpl.html`. Only its `e2e9.cjs` part was replayed.

## Changes made for this folder

None. The files are byte-identical to the final transcript state, and `node --check` passes for all 13 without edits. The following hard-coded values were left as they were:

- **Base URL:** `B` defaults to `http://localhost:3101`. Override it with `B=…`.
- **Database path:** `DB` defaults to the deleted scratchpad `…/scratchpad/testdata/app.db` (e2e3b–e2e9) or to `__dirname + "/testdata/app.db"` (e2e10, e2e11, e2e12, trace-verify). Always set `DB=<data dir>/app.db` when running.
- **App root:** `e2e10.cjs` uses `P` as the app root for `npm run test:report`. Override it with `P=…`.
- **Absolute paths outside the scratchpad:**
  - `e2e3b(-h)`: `PHOTO = …/output/3D_배치도.png` (still exists)
  - `trace-verify`: `DRAWING = …/output/usability-test-20261002/test-L-drawing.png` (still exists)
  - `e2e12`: screenshots go to `OUT = …/output/role-e2e-20261002/fix-20261002`
- **Fixture files not recovered.** These are image files, not part of the transcript text. They must sit next to the scripts (`e2e6` resolves them from the current working directory, the others from `__dirname`):
  - `photo1.jpg` and `plan1.jpg`: copies of `platform/seed-assets/s01-1.jpg` and `s02-2.jpg` (L1594).
  - `trace-L.png`, `trace-L.pdf` and `trace-R.png`, used by e2e9: made by `mkdrawing.cjs` and `mkpdf.cjs` (L4622 and L4627, later edited at L4910, L4915 and L4926). Those two scripts are not restored here.
- **Server log:** `e2e8` reads `server.log` next to `DB`.
- **App version:** the scripts target the office app as it was on 2026-10-02 (`platform` and `platform-home`, port 3101 test server, `SEED_DEMO=1`). They may need updating before they pass against `platform-next`.

## Not recovered

- `e2e3.cjs` and `e2e4.cjs` are the base versions of e2e3b and e2e4b. They were not requested, and they are fully replaced by the b versions. They are also recoverable from L527, L586, L670 and L657.
- `restart.sh`, `runall-home.sh`, the fixture generators and other helper scripts are out of scope.

## Uncertainty

- **Files with file-history backups** (e2e8, e2e9, e2e10, e2e11, e2e12, trace-verify): no remaining uncertainty. They are identical to Claude Code's own backups.
- **e2e3b, e2e4b, e2e5, e2e6, t8 and the -h copies:** there is no file-history backup. The last full listings of e2e3b, e2e4b, e2e5 and e2e6 are from 10-02 04:23–04:35. They predate:
  - the python edits at L3818, L3839, L3881, L3912, L3956, L3971 and L6329
  - the bulk sed at L5745

  Those edits were replayed exactly. Each python edit asserted that its target text was present, and they all passed. Later greps, the e2e3b vs e2e3b-h diff and the saved check-name lists all agree with the result. Any remaining risk is limited to a change made outside any recorded tool call, and no sign of one was found.

## Ported to the runner (2026-10-05)

The files in this folder stay as the untouched historical copies. The runnable versions are the top-level `tests/e2e/office-*.cjs`, which `npm run test:e2e` (`scripts/e2e.mjs`) runs with fresh demo data per suite. The runner only picks up top-level `tests/e2e/*.cjs`, so nothing in `legacy/`, `lib/` or `fixtures/` is run as a suite.

### Old → new

| Old file | New suite | Old checks (fresh data, 10-02) | New checks | Notes |
| --- | --- | --- | --- | --- |
| `e2e3b.cjs`, `e2e3b-h.cjs` | `office-journey.cjs` | 47 | 49 | Built from `e2e3b-h` (the variant for the current app, with the 5 home examples). `e2e3b` (14 office cards, title `이런 사무실 어때요?`) is superseded; its check names are the same. |
| `e2e4b.cjs` | `office-proposal.cjs` | 33 | 35 | |
| `e2e5.cjs`, `e2e5-h.cjs` | `office-explore.cjs` | 63 | 65 | Built from `e2e5-h`. `e2e5` (pre-home) has the same check names. |
| `e2e6.cjs` | `office-intake-ops.cjs` | 55 | 57 | |
| `e2e8.cjs` | `office-space-editor.cjs` | 80 | 80 | Already had both common checks (`브라우저 오류 없음`, `서버 로그 오류 없음`). |
| `e2e9.cjs` | `office-trace.cjs` | 95 | 96 | |
| `e2e10.cjs` | `office-real-vendors.cjs` | 17 | 18 | |
| `e2e11.cjs` | `office-vendor-mobile.cjs` | 10 | 11 | |
| `e2e12.cjs` | `office-windows-revisions.cjs` | 38 | 39 | |
| `trace-verify.cjs` | `office-trace-sizes.cjs` | 29 | 30 | |
| `t8.cjs` | `lib/office.cjs` | – | – | Same `makeSpace` / `requestSpace` / `designAsIs`, plus `KEYS` (13 quote items) and `assignmentOf`. The generic parts every script repeated (env, `check`, browser, login, `sql`, screenshots) moved to `lib/harness.cjs`. |

### Check names

Every old check name is kept verbatim, so old result files can be compared line by line after dropping the `PASS `/`FAIL ` prefix and anything after ` — ` (old files: `output/home-integration-20261002/{e2e-fresh-head,e2e-live-copy,e2e-control-old-code}/*.out`, `output/home-phase1-20261002/*.out`). A name-by-name comparison against `e2e-fresh-head` shows no old name missing. The differences are:

- **Added common checks.** Each suite now ends with `페이지 오류 없음` and `서버 로그 오류 없음` (`lib/harness.cjs`). e2e3b, e2e4b, e2e5 and e2e6 only printed a `page errors: N` line before; e2e9–e2e12 and trace-verify had only the page-error check. `office-space-editor` keeps e2e8's name `브라우저 오류 없음` for the page-error check.
- **e2e10 vendor names.** `실제업체A-<timestamp>: 받은 요청에 배치(평면·3D) 표시` and `…: 제안 안내 문구(…)` became `실제업체A: …` / `실제업체B: …`. The timestamp changed on every run, so the old names were never comparable anyway.
- **Output format.** Lines are `PASS <name>` and `FAIL <name> — <value>`. `## <group>` lines (e2e8, e2e9) are kept. A crash prints `FAIL 실행 중단 — <stack>`.

### What changed in the logic

No check was dropped and no expectation was loosened except where a fixed number or a fixed wait was replaced (`docs/test-improvements.md` items 1–6):

- **Environment.** `B`, `DB` and `P` must be set (the runner sets them); there are no defaults any more, so a script can never fall back to port 3101, the deleted scratchpad DB, or `platform/`. Screenshots are written only with `SHOTS=1`, into `P/.e2e-data/shots/<suite>/` (e2e12 used to write to `output/role-e2e-20261002/fix-20261002`, e2e3b/e2e4b to `./shots`, trace-verify next to the script).
- **Fixtures** come from `tests/e2e/fixtures/`: `photo1.jpg`, `plan1.jpg` (e2e3b used `output/3D_배치도.png` as its upload; it now uploads `photo1.jpg`), `trace-L.png`, `trace-R.png`, `trace-L.pdf` (recreated by `fixtures/make-trace-fixtures.cjs` from `mkdrawing.cjs` L4622 + L4910/L4915/L4926 and `mkpdf.cjs` L4627; the regenerated `trace-L.png` and `trace-L.pdf` have the same byte size as the originals listed at L4916, 17,683 and 19,371), and `test-L-drawing.png` (copy of `output/usability-test-20261002/test-L-drawing.png`, used by trace-verify).
- **Counts from the DB (item 6).** `office-journey` and `office-explore` compare card counts with the approved-vendor cases in the DB instead of 14/19; the example-label count with `is_example=1` cases; the style/size/region/combined/search filter counts (5, 3, 2, 4) and `시공 사례 5건` with DB counts; `/vendors/1` and `/cases/1` with ids read from the DB.
- **Mail and report scoping (items 1–4).** `office-intake-ops` counts only mails with an id above the last one at suite start. `office-real-vendors` checks that the two vendors it registered got `/reset/` links that are shown in the mail log, reads the test report before marking the project and expects exactly one more test project, and inspects only that project's block.
- **Waits (item 5 and others).** `office-proposal` waits for the `load` event of the reload triggered by `임시 저장 버리기`. Fixed sleeps after server actions became condition waits (`until` on the DB, `waitForSelector`): file delete, `변경 내용 보내기`, `확인했고 제안은 그대로 유지`, 다시 알리기, 배정 취소, 테스트 표시, 링크 만들기, 결과 기록, style picker saves, editor start chips, and the `/try` condition changes (debounced 180 ms). Only the short settle before the mobile overflow measurements remains.
- **Server log.** The common `서버 로그 오류 없음` check reads `server.log` only from the last `▲ Next.js` line, i.e. since the current server started, so an `E2E_BASE` copy that carries an old log does not fail it.
- **Browser flags.** e2e10, e2e11 and e2e12 launched Chrome without SwiftShader. `office-real-vendors`, `office-vendor-mobile` and `office-windows-revisions` keep that (`suite(name, { webgl: false })`); with software WebGL the 3D viewers on the vendor and admin pages made e2e12 take 148 s instead of 9 s. All other suites keep SwiftShader.

### Verified

Before porting, every legacy script was run unchanged (fixtures copied next to it, e2e12's output folder redirected) against a fresh `SEED_DEMO=1` server built from this repo: all 10 passed with the same counts as `e2e-fresh-head` (47, 33, 63, 55, 80, 95, 17, 10, 38, 29). That also confirms the regenerated trace fixtures. The ported suites pass under `npm run test:e2e`; see `tests/e2e/README.md`.

To check items 1–4, a "used" data folder was built from the data that `office-intake-ops` leaves behind (mails to vendor1–3 with the same subjects, a test-marked project), with the `[예시]` demo project also marked as a test project and an old `⨯ Error:` line appended to `server.log`. On that copy the unchanged legacy scripts fail exactly the known way (e2e6: 50/55, the five vendor mail counts; e2e10: 15/17, the mail-log links and the test report), while all ten `office-*` suites pass with `E2E_BASE=<that copy>`.
