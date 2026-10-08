// Controlled vision samples, not real apartment plans. Ground truth is never sent to the model.
// Regenerate: node tests/e2e/fixtures/make-ai-fixtures.cjs
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS fixture generator. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const plans = [
  {name:'ai-three-room', iw:1200, ih:1000, widthMm:10000,
    outline:[[100,100],[1100,100],[1100,900],[100,900]],
    walls:[{a:[500,100],b:[500,900]},{a:[500,500],b:[1100,500]}],
    openings:[{kind:'door',a:[500,280],b:[500,370]},{kind:'door',a:[750,500],b:[840,500]},
      {kind:'entry',a:[180,900],b:[280,900]},{kind:'window',a:[700,100],b:[1000,100]},
      {kind:'window',a:[100,550],b:[100,800]}],
    labels:[{point:[300,400],name:'거실',kind:'living'},{point:[800,290],name:'침실',kind:'bed'},
      {point:[800,720],name:'주방',kind:'kitchen'}], rooms:3},
  {name:'ai-L-room', iw:1200, ih:1000, widthMm:8000,
    outline:[[100,100],[900,100],[900,500],[600,500],[600,800],[100,800]],
    walls:[{a:[600,100],b:[600,500]}],
    openings:[{kind:'door',a:[600,250],b:[600,340]},
      {kind:'entry',a:[220,800],b:[320,800]},{kind:'window',a:[680,100],b:[830,100]}],
    labels:[{point:[350,400],name:'거실',kind:'living'},{point:[750,300],name:'침실',kind:'bed'}], rooms:2},
];
const scaled=structuredClone(plans[0]);scaled.name='ai-offset-plan';scaled.iw=1600;
const move=([x,y])=>[Math.round(x*.7+200),Math.round(y*.7+80)];
scaled.outline=scaled.outline.map(move);scaled.walls=scaled.walls.map(w=>({a:move(w.a),b:move(w.b)}));
scaled.openings=scaled.openings.map(o=>({...o,a:move(o.a),b:move(o.b)}));scaled.labels=scaled.labels.map(l=>({...l,point:move(l.point)}));
scaled.stroke=8;scaled.outerStroke=16;scaled.font=24;
const gray=structuredClone(plans[0]);gray.name='ai-gray-plan';gray.stroke=8;gray.outerStroke=16;gray.wallColor='#555';gray.windowColor='#555';gray.railWidth=1;
plans.push(scaled,gray,
  {name:'ai-studio',iw:1200,ih:1000,widthMm:9000,
    outline:[[160,170],[1060,170],[1060,770],[160,770]],walls:[],
    openings:[{kind:'entry',a:[160,550],b:[160,650]},{kind:'window',a:[650,170],b:[950,170]},{kind:'window',a:[300,770],b:[550,770]}],
    labels:[{point:[580,440],name:'거실',kind:'living'}],rooms:1},
  {name:'ai-four-room',iw:1400,ih:1100,widthMm:10000,
    outline:[[180,160],[1180,160],[1180,960],[180,960]],
    walls:[{a:[600,160],b:[600,960]},{a:[180,550],b:[1180,550]}],
    openings:[{kind:'door',a:[600,350],b:[600,440]},{kind:'door',a:[600,700],b:[600,790]},
      {kind:'door',a:[320,550],b:[400,550]},{kind:'door',a:[800,550],b:[900,550]},
      {kind:'entry',a:[1000,960],b:[1100,960]},{kind:'window',a:[280,160],b:[480,160]},
      {kind:'window',a:[780,160],b:[1080,160]},{kind:'window',a:[1180,700],b:[1180,880]}],
    labels:[{point:[350,350],name:'침실1',kind:'bed'},{point:[890,340],name:'거실',kind:'living'},
      {point:[360,750],name:'침실2',kind:'bed'},{point:[880,750],name:'주방',kind:'kitchen'}],rooms:4});
async function main(){
  const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const p=await browser.newPage();
  try {
    for(const plan of plans){
      await p.setContent(`<canvas id="c" width="${plan.iw}" height="${plan.ih}"></canvas>`);
      await p.evaluate(plan=>{
        const c=document.getElementById('c').getContext('2d');
        c.fillStyle='#fff';c.fillRect(0,0,plan.iw,plan.ih);
        const line=(a,b,color=plan.wallColor??'#151515',width=plan.stroke??12)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(...a);c.lineTo(...b);c.stroke();};
        // The inner edge is the exact supplied outline; stroke extends to the outside only.
        c.strokeStyle=plan.wallColor??'#151515';c.lineWidth=plan.outerStroke??24;c.lineJoin='miter';
        c.beginPath();plan.outline.forEach((q,i)=>i?c.lineTo(...q):c.moveTo(...q));c.closePath();c.stroke();
        c.fillStyle='#fff';c.fill();
        for(const w of plan.walls)line(w.a,w.b);
        for(const o of plan.openings){
          line(o.a,o.b,'#fff',28);
          if(o.kind==='window'){
            line(o.a,o.b,plan.windowColor??'#24619b',plan.railWidth??2);
            const dx=o.a[0]===o.b[0]?4:0,dy=o.a[1]===o.b[1]?4:0;
            line([o.a[0]+dx,o.a[1]+dy],[o.b[0]+dx,o.b[1]+dy],plan.windowColor??'#24619b',plan.railWidth??2);
            line([o.a[0]-dx,o.a[1]-dy],[o.b[0]-dx,o.b[1]-dy],plan.windowColor??'#24619b',plan.railWidth??2);
          }else{
            const vertical=o.a[0]===o.b[0],w=Math.hypot(o.b[0]-o.a[0],o.b[1]-o.a[1]);
            const end=vertical?[o.a[0]+w,o.a[1]]:[o.a[0],o.a[1]-w];
            line(o.a,end,'#555',2);c.strokeStyle='#888';c.lineWidth=1;
            c.beginPath();c.arc(o.a[0],o.a[1],w,vertical?0:-Math.PI/2,vertical?Math.PI/2:0);c.stroke();
            if(o.kind==='entry'){c.font='18px sans-serif';c.fillStyle='#333';if(vertical){c.textAlign='right';c.fillText('현관',o.a[0]-20,(o.a[1]+o.b[1])/2);}else{c.textAlign='left';c.fillText('현관',o.a[0],o.a[1]+45);}}
          }
        }
        c.font=`${plan.font??30}px sans-serif`;c.textAlign='center';c.fillStyle='#151515';
        for(const l of plan.labels)c.fillText(l.name,...l.point);
        const minX=Math.min(...plan.outline.map(q=>q[0])),maxX=Math.max(...plan.outline.map(q=>q[0])),top=Math.min(...plan.outline.map(q=>q[1]));
        line([minX,top-50],[maxX,top-50],'#777',1);line([minX,top-60],[minX,top-20],'#777',1);line([maxX,top-60],[maxX,top-20],'#777',1);
        c.font='22px sans-serif';c.fillText('실내 전체 가로 '+plan.widthMm.toLocaleString('en-US')+' mm',(minX+maxX)/2,top-65);
        c.font='18px sans-serif';c.fillText('인식 검증용 가상 주거 도면 · 실제 아파트 아님',plan.iw/2,plan.ih-30);
      },plan);
      await p.locator('#c').screenshot({path:path.join(__dirname,plan.name+'.png')});
      fs.writeFileSync(path.join(__dirname,plan.name+'.json'),JSON.stringify(plan,null,2)+'\n');
    }
    console.log('가상 주거 도면 '+plans.length+'개와 비교용 정답 좌표 생성');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
