import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 실제 데이터는 읽거나 쓰지 않는다. 매번 독립 폴더에서 실제 주문 처리 함수를 검증한다.
async function main() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"commerce-regression-"));
  process.env.DATA_DIR=dir; process.env.SEED_DEMO="1";
  const {get,all,run,db}=await import("../lib/db");
  const {completeClaim,finalizePaid}=await import("../lib/order-flow");
  const {groupSettlement,liveQty,lineProblem,claimedQty}=await import("../lib/shop");
  const {openExchange,approveExchange,collectExchange,shipExchange,receiveExchange}=await import("../lib/exchanges");
  const {productTemplate,templatesForEdits}=await import("../lib/shop-place");
  const {rebuildPlacement}=await import("../lib/space/placement");
  const {rebuildRoomItems}=await import("../lib/space/home-room");
  const {rebuildHouseItems}=await import("../lib/space/house");
  const {referencePost,attachPostReference,projectPostRefs}=await import("../lib/post-refs");
  const {buildSnapshot,diffRequest}=await import("../lib/request-snapshot");
  const {getProject,getVersion}=await import("../lib/data");
  const customer=get<{id:number}>(`SELECT id FROM users WHERE email='customer@demo.kr'`)!.id;
  const seller=get<{id:number}>(`SELECT id FROM sellers ORDER BY id LIMIT 1`)!.id;
  let checks=0;
  const check=(name:string,fn:()=>void) => { fn(); checks++; console.log(`PASS ${name}`); };
  function order(qty=1,unit=10000,ship=3000,status="paid",policy={ship_fee:3000,free_ship_over:null as number|null,return_fee:3000}) {
    const product=run(`INSERT INTO products(seller_id,title,category,price,status,width_mm,depth_mm,height_mm) VALUES (?,'회귀 검증 상품','deco',?,'on_sale',1000,400,700)`,seller,unit);
    const sku=run(`INSERT INTO product_skus(product_id,stock,opt1) VALUES (?,10,'기본')`,product);
    const id=run(`INSERT INTO orders(no,user_id,status,title,items_amount,ship_amount,total_amount,recipient,phone,address1,pg,payment_key) VALUES (?,?,'paid','회귀 검증',?,?,?,'테스트','01012345678','가상 주소','test','test')`,`REG-${Date.now()}-${Math.random()}`,customer,qty*unit,ship,qty*unit+ship);
    const group=run(`INSERT INTO order_groups(order_id,seller_id,ship_fee,status,shipping_policy) VALUES (?,?,?,?,?)`,id,seller,ship,status,JSON.stringify(policy));
    const item=run(`INSERT INTO order_items(order_id,group_id,product_id,sku_id,title,unit_price,qty,amount) VALUES (?,?,?,?,'검증',?,?,?)`,id,group,product,sku,unit,qty,unit*qty);
    return {id,group,item,product,sku};
  }
  function claim(o:ReturnType<typeof order>,type="cancel",reason="change_mind",qty=1) {
    return run(`INSERT INTO claims(order_id,group_id,item_id,user_id,type,reason_code,qty) VALUES (?,?,?,?,?,?,?)`,o.id,o.group,o.item,customer,type,reason,qty);
  }
  const free=order(3,10000,0,"paid",{ship_fee:3000,free_ship_over:30000,return_fee:3000});
  const refunds:number[]=[];
  for (let i=0;i<3;i++) { const r=await completeClaim(claim(free),true); assert(r.ok); refunds.push(r.refund); }
  check("분할 취소 3회: 7,000 + 10,000 + 13,000 = 전액 30,000",()=>assert.deepEqual(refunds,[7000,10000,13000]));
  check("전량 취소 후 보류 배송비 0원·재고 정확히 세 개 복구",()=>{ assert.equal(get<any>(`SELECT ship_deducted FROM order_groups WHERE id=?`,free.group).ship_deducted,0);assert.equal(get<any>(`SELECT stock FROM product_skus WHERE id=?`,free.sku).stock,13); });
  const mixed=order(3,10000,0,"paid",{ship_fee:3000,free_ship_over:30000,return_fee:3000});
  const mixedCancel=await completeClaim(claim(mixed),true);
  run(`UPDATE order_groups SET status='delivered' WHERE id=?`,mixed.group);
  const mixedReturn=await completeClaim(claim(mixed,"return","change_mind",2),true);
  check("일부 취소 뒤 나머지 반품: 초기 배송비 중복 차감 없이 총 환불 24,000",()=>{assert(mixedCancel.ok && mixedReturn.ok);assert.equal(mixedCancel.refund + mixedReturn.refund,24000);});
  const paidShip=order(1,10000,3000,"delivered");
  const fault=await completeClaim(claim(paidShip,"return","defect"),true);
  check("불량 전량 반품: 최초 배송비 포함 13,000원 환불",()=>assert.deepEqual(fault,{ok:true,refund:13000}));
  const concurrent=order(1,10000,0);const cid=claim(concurrent);
  const twice=await Promise.all([completeClaim(cid,true),completeClaim(cid,true)]);
  await completeClaim(cid,true);
  check("동시·반복 환불: 완료 기록 한 건·취소 한 개·재고 +1",()=>{assert.equal(all(`SELECT * FROM refunds WHERE claim_id=? AND status='done'`,cid).length,1);assert.equal(get<any>(`SELECT canceled_qty FROM order_items WHERE id=?`,concurrent.item).canceled_qty,1);assert.equal(get<any>(`SELECT stock FROM product_skus WHERE id=?`,concurrent.sku).stock,11);assert(twice.some(r=>r.ok));});
  const failure=order();run(`UPDATE orders SET pg='toss',payment_key='synthetic' WHERE id=?`,failure.id);const failureId=claim(failure);
  const originalFetch=globalThis.fetch;process.env.TOSS_SECRET_KEY="synthetic-only";
  let calls=0;const keys:string[]=[];
  globalThis.fetch=(async (_url:any,opts:any) => { calls++;keys.push(opts.headers["Idempotency-Key"]);return new Response(JSON.stringify(calls===1?{message:"synthetic failure"}:{status:"CANCELED"}),{status:calls===1?500:200}); }) as typeof fetch;
  const failed=await completeClaim(failureId,true);
  check("환불 실패 때 재고·수량 변경 없음",()=>{assert(!failed.ok);assert.equal(get<any>(`SELECT stock FROM product_skus WHERE id=?`,failure.sku).stock,10);assert.equal(get<any>(`SELECT canceled_qty FROM order_items WHERE id=?`,failure.item).canceled_qty,0);});
  const retried=await completeClaim(failureId,false);
  globalThis.fetch=originalFetch;delete process.env.TOSS_SECRET_KEY;
  check("재시도는 같은 PG 키·최초 복구 조건으로 한 번 완료",()=>{assert(retried.ok);assert.equal(keys[0],keys[1]);assert.equal(get<any>(`SELECT stock FROM product_skus WHERE id=?`,failure.sku).stock,11);});
  const invalid=order();run(`UPDATE orders SET status='pending',total_amount=-7000 WHERE id=?`,invalid.id);
  const negative=await finalizePaid(invalid.id,"test","invalid","");check("음수 주문 결제 차단",()=>assert(!negative.ok));
  check("음수 상품 장바구니도 구매 차단",()=>assert(lineProblem({price:10000,add_price:-20000,qty:1,stock:10,sku_active:1,product_status:"on_sale",seller_status:"approved"} as any)));
  const normal=order();run(`UPDATE orders SET status='pending' WHERE id=?`,normal.id);
  await Promise.all([finalizePaid(normal.id,"test","normal",""),finalizePaid(normal.id,"test","normal","")]);
  check("결제 재호출 시 재고 한 번 차감",()=>assert.equal(get<any>(`SELECT stock FROM product_skus WHERE id=?`,normal.sku).stock,9));
  const exOrder=order(1,10000,3000,"delivered");
  const target=run(`INSERT INTO product_skus(product_id,stock,opt1,add_price) VALUES (?,5,'큰 옵션',5000)`,exOrder.product);
  const exId=openExchange(exOrder.item,customer,target,1,"change_mind","");
  check("교환 요청은 취소·반품 가능 수량에서 제외",()=>assert.equal(claimedQty(exOrder.item),1));
  approveExchange(exId,"");
  const ex=get<any>(`SELECT * FROM exchanges WHERE id=?`,exId);
  check("교환 가격 +5,000·왕복 배송 6,000 → 추가 11,000원",()=>assert.equal(ex.amount_due,11000));
  check("승인 시 교환 옵션 재고 예약·중복 승인 차단",()=>{assert.equal(get<any>(`SELECT stock FROM product_skus WHERE id=?`,target).stock,4);assert.throws(()=>approveExchange(exId,""));});
  await collectExchange(exId,true);
  check("회수했지만 추가 결제 전 발송 차단",()=>{assert.equal(get<any>(`SELECT status FROM exchanges WHERE id=?`,exId).status,"collected");assert.throws(()=>shipExchange(exId,"택배","1"));});
  await finalizePaid(ex.payment_order_id,"test","extra","");shipExchange(exId,"택배","123");receiveExchange(exId,customer);
  const replacement=get<any>(`SELECT replacement_item_id FROM exchanges WHERE id=?`,exId).replacement_item_id;
  check("교환 수령 후 새 옵션으로 주문·수량 연결",()=>{assert.equal(liveQty(get<any>(`SELECT * FROM order_items WHERE id=?`,exOrder.item)),0);assert.equal(get<any>(`SELECT sku_id FROM order_items WHERE id=?`,replacement).sku_id,target);assert.equal(get<any>(`SELECT status FROM exchanges WHERE id=?`,exId).status,"completed");});
  const before=groupSettlement(exOrder.group,.1);
  check("교환 정산: 총 결제 24,000 − 상품 수수료 1,500 = 22,500",()=>assert.deepEqual(before,{sales:24000,refunds:0,commission:1500,payout:22500}));
  const replacementClaim=run(`INSERT INTO claims(order_id,group_id,item_id,user_id,type,reason_code,qty) VALUES (?,?,?,?,'return','defect',1)`,exOrder.id,exOrder.group,replacement,customer);
  const split=await completeClaim(replacementClaim,true);
  check("교환 후 불량 반품: 원 결제와 추가 결제로 나눠 18,000 환불",()=>{assert(split.ok);assert.equal(split.refund,18000);assert.equal(all(`SELECT * FROM refunds WHERE claim_id=? AND status='done'`,replacementClaim).length,2);});
  check("교환 후 반품 정산에서 교환 배송비만 남음",()=>assert.deepEqual(groupSettlement(exOrder.group,.1),{sales:24000,refunds:18000,commission:0,payout:6000}));
  const down=order(1,10000,3000,"delivered");const lower=run(`INSERT INTO product_skus(product_id,stock,add_price) VALUES (?,5,-5000)`,down.product);
  const downId=openExchange(down.item,customer,lower,1,"defect","");approveExchange(downId,"");
  await Promise.all([collectExchange(downId,true),collectExchange(downId,true)]);await collectExchange(downId,true);
  check("낮은 가격 교환: 차액 5,000 환불·회수 재고 한 번만 복구",()=>{assert.equal(get<any>(`SELECT sum(amount) AS n FROM refunds WHERE job_key=? AND status='done'`,`exchange-${downId}`).n,5000);assert.equal(get<any>(`SELECT stock FROM product_skus WHERE id=?`,down.sku).stock,11);});
  const p=order();const old=productTemplate(p.product,p.sku)!;
  const placed={...old,id:"product-item",x:2,y:2,rot:0,origin:"added",src:`catalog:${old.type}`} as any;
  const edit={id:placed.id,src:placed.src,x:2.5,y:2,rot:90,w:3,d:3} as any;
  const room={width:6,depth:5} as any;
  run(`UPDATE products SET width_mm=2000,height_mm=900 WHERE id=?`,p.product);
  for (const [label,rebuild] of [["사무실",()=>rebuildPlacement([edit],null,templatesForEdits([edit]),room,[placed])],["방 한 칸",()=>rebuildRoomItems([edit],room,templatesForEdits([edit]),[placed])],["집 전체",()=>rebuildHouseItems([edit],room,templatesForEdits([edit]),[placed])]] as const) {
    const result=rebuild();check(`${label}: 판매자 규격 변경 후 기존 1m·높이 0.7m 유지`,()=>{assert("items" in result);assert.equal(result.items[0].w,1);assert.equal(result.items[0].product!.h,.7);});
  }
  run(`UPDATE products SET status='deleted' WHERE id=?`,p.product);
  for (const [label,rebuild] of [["사무실",()=>rebuildPlacement([edit],null,[],room,[placed])],["방 한 칸",()=>rebuildRoomItems([edit],room,[],[placed])],["집 전체",()=>rebuildHouseItems([edit],room,[],[placed])]] as const) {
    const result=rebuild();check(`${label}: 삭제된 상품도 기존 배치 이동·저장 가능`,()=>assert("items" in result));
  }
  check("저장 내역 없는 삭제 상품 새로 추가 차단",()=>assert("error" in rebuildRoomItems([edit],room,[],[])));
  const post={id:run(`INSERT INTO posts(user_id,type,title,body,space_kind) VALUES (?,'space','검증 공간 소개','내용','home')`,customer)};
  run(`INSERT INTO post_photos(post_id,file_id,position) VALUES (?,?,0)`,post.id,get<any>(`SELECT id FROM files ORDER BY id LIMIT 1`).id);
  const reference=referencePost(post.id)!;const project=getProject(1)!;const fd=new FormData();fd.set("referencePost",String(reference.postId));fd.set("referencePhoto",String(reference.photoId));attachPostReference(project.id,fd);
  const snapshot=buildSnapshot(project,getVersion(project.current_version_id!)!);
  run(`UPDATE posts SET title='나중에 바뀐 제목' WHERE id=?`,post.id);
  check("게시물 제목 변경 뒤 참고 사진·제목과 업체 요청 기록 보존",()=>{assert.equal(projectPostRefs(project.id)[0].title,reference.title);assert.equal(snapshot.postRefs![0].fileId,reference.fileId);});
  run(`DELETE FROM project_post_refs WHERE project_id=?`,project.id);
  check("참고 게시물 해제는 다음 전송의 변경 목록으로 표시",()=>assert(diffRequest(snapshot,buildSnapshot(project,getVersion(project.current_version_id!)!)).some(x=>x.includes("참고 커뮤니티 공간 제외"))));
  check("DB 외래 키 무결성",()=>assert.equal(all(`PRAGMA foreign_key_check`).length,0));
  console.log(`\n${checks} checks passed`);db().close();fs.rmSync(dir,{recursive:true,force:true});
}
main().catch(e=>{console.error(e);process.exit(1);});
