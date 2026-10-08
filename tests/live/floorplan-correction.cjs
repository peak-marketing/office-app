// Replays the saved REAL provider result, then checks customer corrections without another paid call.
// B, DB, P, SHOTS as in floorplan.cjs; LIVE_RECORDED_PLAN=<L-original/result.json> is required.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS test using the existing harness. */
const fs=require('fs'),path=require('path');
if(!process.env.DB||!path.basename(path.dirname(process.env.DB)).startsWith('data-ai-live'))throw new Error('별도 data-ai-live 데이터만 사용하세요.');
if(!process.env.LIVE_RECORDED_PLAN)throw new Error('실제 모델 응답 기록 LIVE_RECORDED_PLAN을 주세요.');
const {suite}=require('../e2e/lib/harness.cjs');const t=suite('floorplan-correction');
const number=q=>Number(t.sql(q)),quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const house=pid=>JSON.parse(t.sql(`select house from versions where id=(select current_version_id from projects where id=${pid})`));
const mm=async(p,id,value)=>{await p.fill(`[data-testid=${id}]`,String(value));await p.press(`[data-testid=${id}]`,'Enter');};
t.run(async()=>{
  const c=await t.page();await t.login(c,'customer@demo.kr');
  const pid=number("select id from projects where title='실제 API 검증 공간' order by id desc limit 1");
  if(!pid)throw new Error('먼저 실제 API 흐름 테스트를 실행하세요.');
  await c.goto(t.B+`/projects/${pid}/house/edit`);
  const win=house(pid).openings.find(o=>o.kind==='window'&&o.wall==='o3');
  const old=JSON.parse(t.sql(`select snapshot from request_revisions where project_id=${pid} order by no asc limit 1`));
  t.check('실제 AI가 길게 읽은 창의 원래 요청 기록 유지',old.house.openings.find(o=>o.id===win.id).width===3.5);
  if(win.width!==2.5 || house(pid).openings.find(o=>o.id==='d1').at!==.8){
    await c.click('[data-testid=mode-window]');await c.click(`[data-testid=opening-${win.id}]`,{force:true});await mm(c,'opening-w',2500);
    await c.click('[data-testid=mode-door]');await c.click('[data-testid=opening-d1]',{force:true});await mm(c,'opening-w',1000);await mm(c,'opening-at',800);
    await c.click('[data-testid=editor-save]');await t.until(()=>house(pid).openings.find(o=>o.id===win.id).width===2.5);
  }
  await c.reload();
  t.check('사용자가 창 폭과 현관 위치·폭을 원본대로 수정·저장',house(pid).openings.find(o=>o.id===win.id).width===2.5&&house(pid).openings.find(o=>o.id==='d1').at===.8&&house(pid).openings.find(o=>o.id==='d1').width===1);
  t.check('수정 뒤 다시 열어도 창 2,500mm 유지',house(pid).openings.find(o=>o.id===win.id).width===2.5);
  t.check('수정 전 요청에 잘못 읽은 창을 덮어쓰지 않음',old.house.openings.find(o=>o.id===win.id).width===3.5);
  await c.goto(t.B+`/projects/${pid}`);
  if(await c.locator('[data-testid=send-update]').count()){await c.click('[data-testid=send-update]');await c.waitForSelector('[data-testid=pending-changes]',{state:'detached'});}
  const latest=JSON.parse(t.sql(`select snapshot from request_revisions where project_id=${pid} order by no desc limit 1`));
  t.check('변경 내용 보내기 뒤에 수정한 창을 새 요청 기준으로 전달',latest.house.openings.find(o=>o.id===win.id).width===2.5);
  const aid=number(`select id from assignments where project_id=${pid} order by id limit 1`),v=await t.page();await t.login(v,'vendor1@demo.kr');await v.goto(t.B+`/vendor/requests/${aid}`);
  t.check('업체가 수정한 평면 버전을 받음',Number(await v.locator('[data-testid=house-view]').getAttribute('data-house-rev'))===latest.house.rev);
  await t.shot(c,'corrected-request');
  // The L plan below is a recorded real output, not another call and not a claimed successful model recognition.
  const recorded=JSON.parse(fs.readFileSync(process.env.LIVE_RECORDED_PLAN,'utf8'));
  const customer=number("select id from users where email='customer@demo.kr'");
  const bytes=fs.readFileSync(t.fixture('ai-L-room.png')),stored='real-L-recorded.png';fs.copyFileSync(t.fixture('ai-L-room.png'),path.join(path.dirname(t.DB),'uploads',stored));
  const fid=number(`insert into files(owner_id,kind,original_name,stored_name,mime,size,category) values(${customer},'photo','real-L-recorded.png','${stored}','image/png',${bytes.length},'ai-floorplan');select last_insert_rowid();`);
  const job=number(`insert into floorplan_jobs(owner_id,file_id,status,result,iw,ih) values(${customer},${fid},'ready',${quote(JSON.stringify(recorded.plan))},1200,1000);select last_insert_rowid();`);
  await c.goto(t.B+`/spaces/recognize?job=${job}`);
  const warnings=await c.locator('[data-testid=house-provenance]').textContent();
  t.check('실제 ㄱ자 응답의 벽 연결·합쳐진 방 문제를 초안에서 안내',warnings.includes('끝이 다른 벽')&&warnings.includes('한 방'));
  await c.check('[data-testid=ai-confirm]');await c.fill('input[name=title]','실제 ㄱ자 응답 수정');await c.click('[data-testid=ai-import]');await c.waitForURL(/projects\/\d+\/house\/edit/);
  const lid=Number(c.url().match(/projects\/(\d+)/)[1]);
  t.check('수정 전 실제 응답의 방 하나 계산을 재현',JSON.parse(await c.locator('[data-testid=house-editor]').getAttribute('data-rooms')).length===1);
  const h=house(lid),corner=h.outline.find(q=>q[0]>0&&q[0]<h.width&&q[1]>0&&q[1]<h.depth);
  await c.click('[data-testid=mode-wall]');await c.click('[data-testid=wall-pick]');
  const xy=await c.evaluate(([x,y])=>{
    const svg=document.querySelector('[data-testid=house-plan]'),D=Number(svg.dataset.depth);
    const at=()=>new DOMPoint(x,D-y).matrixTransform(svg.getScreenCTM());let q=at();
    const box=svg.closest('[data-testid=plan-scroll]');if(box){const r=box.getBoundingClientRect();box.scrollLeft+=q.x-(r.left+r.width/2);box.scrollTop+=q.y-(r.top+r.height/2);q=at();}
    window.scrollBy(0,q.y-innerHeight*.3);q=at();return [q.x,q.y];
  },[h.walls[0].a[0],h.walls[0].a[1]+(h.walls[0].b[1]-h.walls[0].a[1])*.9]);
  await c.mouse.click(...xy);await c.waitForSelector('[data-testid=wall-x]');
  await mm(c,'wall-x',Math.round(corner[0]*1000));
  t.check('벽을 바깥 벽에 연결하면 두 방으로 복원',JSON.parse(await c.locator('[data-testid=house-editor]').getAttribute('data-rooms')).length===2);
  await c.click('[data-testid=editor-save]');await t.until(()=>house(lid).walls[0].a[0]===corner[0]);await c.reload();
  t.check('고친 벽과 두 방 구분이 저장·다시 열기에 유지',house(lid).walls[0].a[0]===corner[0]&&JSON.parse(await c.locator('[data-testid=house-editor]').getAttribute('data-rooms')).length===2);
  await t.shot(c,'L-wall-corrected');
});
