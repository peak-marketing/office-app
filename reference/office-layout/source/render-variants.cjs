const {chromium}=require('playwright-core');
const fs=require('fs'),path=require('path');
(async()=>{
 const out=path.resolve(__dirname,'../output'),styles=require('./styles.json');
 const browser=await require('./browser.cjs').launchBrowser({headless:true});
 const p=await browser.newPage({viewport:{width:1680,height:1100}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 for(const s of styles){
  const dir=path.join(out,s.code+'_'+s.name);
  await p.goto('file://'+dir+'/3D.html');await p.waitForFunction(()=>window.ready);await p.waitForTimeout(500);
  if(await p.evaluate(()=>window.activeTheme)!==s.id)throw Error('Wrong default theme');
  await p.screenshot({path:dir+'/3D_화면.png'});
  const png=await p.locator('#view').evaluate(c=>c.toDataURL('image/png').split(',')[1]);fs.writeFileSync(dir+'/3D_배치도.png',Buffer.from(png,'base64'));
  fs.writeFileSync(dir+'/사무실_모델.glb',Buffer.from(await p.evaluate(()=>window.exportGLB()),'base64'));
  await p.locator('#plan').click();if(!await p.locator('#themePlan svg').isVisible())throw Error('Missing theme plan');await p.locator('#closePlan').click();
  console.log(s.name+': rendered and exported');
 }
 await p.goto('file://'+out+'/00_3가지스타일_3D.html');await p.waitForFunction(()=>window.ready);
 for(const s of styles){await p.locator(`[data-theme="${s.id}"]`).click();if(await p.locator('#styleName').textContent()!==s.code+' · '+s.name)throw Error('Style switch failed');}
 await p.locator('#top').click();await p.locator('#walls').check();await p.locator('#walls').uncheck();
 console.log(JSON.stringify({errors,styleSwitches:3}));if(errors.length)throw Error(errors.join(';'));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
