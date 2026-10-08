// Explicitly paid live API test; excluded from scripts/e2e.mjs. Never use real customer data.
// Start a separate production build/server with its API key, then:
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS test using the existing harness. */
// LIVE_AI=1 B=http://localhost:3342 DB=<isolated-dir>/app.db P=$PWD SHOTS=1 node tests/live/floorplan.cjs
if(process.env.LIVE_AI!=='1')throw new Error('실제 API 비용이 발생합니다. LIVE_AI=1로 명시적으로 실행하세요.');
const path=require('path'),fs=require('fs');
if(!process.env.DB||!path.basename(path.dirname(process.env.DB)).startsWith('data-ai-live'))throw new Error('data-ai-live로 시작하는 별도 테스트 데이터만 사용하세요.');
const {suite}=require('../e2e/lib/harness.cjs');
const {measureRecognition}=require('./floorplan-metrics.cjs');
const t=suite('floorplan-live'),number=q=>Number(t.sql(q));
const resultDir=process.env.LIVE_AI_OUT?path.resolve(process.env.LIVE_AI_OUT):path.join(t.P,'.e2e-data','live-results');
fs.mkdirSync(resultDir,{recursive:true});
const house=pid=>JSON.parse(t.sql(`select house from versions where id=(select current_version_id from projects where id=${pid})`));
t.run(async()=>{
  const c=await t.page();await t.login(c,'customer@demo.kr');await c.goto(t.B+'/spaces/recognize');
  t.check('서버 API 키 연결 후 실제 인식 버튼 사용 가능',await c.locator('[data-testid=ai-unavailable]').count()===0);
  const before=number('select count(*) from floorplan_jobs');
  await c.setInputFiles('[data-testid=recognize-file]',t.fixture('ai-three-room.png'));await c.waitForSelector('[data-testid=recognition-image]');await c.check('[data-testid=ai-consent]');
  const start=Date.now();await c.click('[data-testid=ai-analyze]');
  await c.waitForSelector('[data-testid=recognition-review], [data-testid=ai-error]',{timeout:145000});
  const job=number('select max(id) from floorplan_jobs');
  const state=t.sql(`select status from floorplan_jobs where id=${job}`);
  t.check('실제 서버→OpenAI→브라우저 인식 완료',state==='ready',await c.locator('[data-testid=ai-error]').textContent().catch(()=>''));
  if(state!=='ready')throw new Error('실제 인식 실패. 고정 결과로 대체하지 않습니다.');
  const plan=JSON.parse(t.sql(`select result from floorplan_jobs where id=${job}`));
  const truth=JSON.parse(fs.readFileSync(t.fixture('ai-three-room.json'),'utf8'));
  const metrics=measureRecognition(plan,truth);
  fs.writeFileSync(path.join(resultDir,'browser-recognition.json'),JSON.stringify({elapsedSeconds:(Date.now()-start)/1000,job,plan,metrics},null,2));
  t.check('고정 기록 없이 업로드한 도면이 실제 분석됨',number('select count(*) from floorplan_jobs')===before+1);
  t.check('가상 도면의 벽·문·창·방과 출력 치수 일치',metrics.withinSampleThreshold,JSON.stringify(metrics));
  await c.fill('[data-testid=ai-width]',String(truth.widthMm));
  const preview=await t.until(async()=>await c.locator('[data-testid=house-view]').count()>0);
  t.check('실제 인식 결과가 치수 평면도로 변환됨',preview,await c.locator('p[role=alert]').allTextContents());
  if(!preview)throw new Error('실제 인식 결과에 저장할 수 없는 구조 오류가 있습니다.');
  await t.shot(c,'original-and-recognition');
  await c.click('[data-testid=house-tab-3d]');await c.waitForSelector('[data-testid=house-3d] canvas');await t.shot(c,'live-3d');
  t.check('실제 인식 평면을 3D로 표시',await c.locator('[data-testid=house-3d] canvas').count()===1);
  await c.check('[data-testid=ai-confirm]');await c.fill('input[name=title]','실제 API 검증 공간');await c.click('[data-testid=ai-import]');await c.waitForURL(/projects\/\d+\/house\/edit/);
  const pid=Number(c.url().match(/projects\/(\d+)/)[1]);
  const h=house(pid);fs.writeFileSync(path.join(resultDir,'saved-house.json'),JSON.stringify(h,null,2));
  t.check('치수·실제 인식 내부 벽·문·창 저장',h.width===10&&h.walls.length===truth.walls.length&&h.openings.length===truth.openings.length&&h.provenance.kind==='ai');
  t.check('저장 시 공사 요청 자동 전송 없음',number(`select requested_version_id is null from projects where id=${pid}`)===1);
  await c.click('[data-testid=mode-furniture]');await c.click('[data-testid=add-h-bed-single]');await c.click('[data-testid=editor-save]');await t.until(()=>house(pid).items.length===1);await c.reload();
  t.check('편집한 가구를 저장·다시 열기',house(pid).items.length===1);
  const fid=h.underlay.fileId;const anonymous=await t.page();
  t.check('실제 도면의 비로그인 공개 차단',(await anonymous.request.get(t.B+`/files/${fid}`)).status()===404);
  await c.goto(t.B+`/projects/${pid}/request`);await c.fill('[data-testid=home-region]','서울 마포구');await c.click('[data-testid=home-send]');await c.waitForURL(new RegExp(`/projects/${pid}$`));
  const snapshot=JSON.parse(t.sql(`select snapshot from request_revisions where project_id=${pid} order by no desc limit 1`));
  t.check('견적 요청 기준에 실제 인식 평면·가구·출처 저장',JSON.stringify(snapshot.house)===JSON.stringify(house(pid)));
  const admin=await t.page();await t.login(admin,'admin@demo.kr');
  t.sql("update vendors set fields='office,home' where user_id=(select id from users where email='vendor1@demo.kr')");
  const vendor=number("select id from vendors where user_id=(select id from users where email='vendor1@demo.kr')");
  await admin.goto(t.B+`/admin/projects/${pid}`);await admin.check(`input[name=vendor][value="${vendor}"]`);await admin.locator('form:has(input[name=vendor]) button').click();
  const aid=number(`select id from assignments where project_id=${pid} and vendor_id=${vendor}`);
  const v=await t.page();await t.login(v,'vendor1@demo.kr');await v.goto(t.B+`/vendor/requests/${aid}`);
  t.check('배정 업체에게 동일한 도면·가구 버전 전달',await v.locator('[data-testid=house-view]').count()===1&&await v.locator('[data-testid=house-provenance]').textContent().then(s=>s.includes('AI 도면 인식')));
  await c.goto(t.B+`/projects/${pid}/house/edit`);await c.click('[data-testid=mode-furniture]');await c.click('[data-testid=add-h-bed-single]');await c.click('[data-testid=editor-save]');await t.until(()=>house(pid).items.length===2);
  t.check('요청 후 수정해도 업체가 받은 평면은 보존',JSON.parse(t.sql(`select snapshot from request_revisions where project_id=${pid} order by no desc limit 1`)).house.items.length===1&&house(pid).items.length===2);
  const phone=await t.phone();await t.login(phone,'customer@demo.kr');await phone.goto(t.B+`/projects/${pid}/house/edit`);await t.shot(phone,'editor-mobile');
  t.check('390px 휴대폰에서 실제 AI 공간 편집 가능',await t.noOverflow(phone)&&await phone.locator('[data-testid=editor-provenance]').count()===1);
  await phone.goto(t.B+`/projects/${pid}/print`);
  t.check('인쇄에 AI 출처·확인 전 안내 유지',await phone.locator('[data-testid=print-house]').textContent().then(s=>s.includes('AI 도면 인식')&&s.includes('업체 확인 전')));
  // Second and final real API call: a decorative 3D image must not turn into an invented floorplan.
  await c.goto(t.B+'/spaces/recognize');await c.setInputFiles('[data-testid=recognize-file]',t.fixture('photo1.jpg'));await c.waitForSelector('[data-testid=recognition-image]');await c.check('[data-testid=ai-consent]');await c.click('[data-testid=ai-analyze]');
  await c.waitForSelector('[data-testid=ai-error]',{timeout:145000});
  t.check('공간 3D 사진에서 도면을 상상해 만들지 않음',(await c.locator('[data-testid=ai-error]').textContent()).includes('평면도로 확인되지')&&await c.locator('[data-testid=recognition-review]').count()===0);
  t.check('외래 키 무결성 유지',t.sql('pragma foreign_key_check;')==='');
});
