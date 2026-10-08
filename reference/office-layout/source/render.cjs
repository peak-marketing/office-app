const { chromium }=require('playwright-core');
const fs=require('fs');const path=require('path');
(async()=>{
 const out=path.resolve(__dirname,'../output');
 const browser=await require('./browser.cjs').launchBrowser({headless:true,args:['--allow-file-access-from-files']});
 const page=await browser.newPage({viewport:{width:1680,height:1100},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+out+'/00_사무실_3D.html');await page.waitForFunction(()=>window.ready===true);await page.waitForTimeout(1800);
 await page.screenshot({path:out+'/02_사무실_3D.png',fullPage:true});
 const png=await page.locator('#view').evaluate(c=>c.toDataURL('image/png').split(',')[1]);fs.writeFileSync(out+'/3D_배치도.png',Buffer.from(png,'base64'));
 const b64=await page.evaluate(()=>window.exportGLB());fs.writeFileSync(out+'/04_사무실_모델.glb',Buffer.from(b64,'base64'));
 await page.locator('#top').click();await page.waitForTimeout(350);await page.screenshot({path:out+'/3D_상부검토.png'});
 await page.locator('#walls').check();await page.locator('#walls').uncheck();await page.locator('#plan').click();
 if(!await page.locator('#planModal').isVisible())throw Error('Plan dialog failed');await page.locator('#closePlan').click();
 console.log(JSON.stringify({errors,modelBytes:Buffer.from(b64,'base64').length,objects:await page.evaluate(()=>window.LAYOUT.length)}));
 await page.goto('file://'+out+'/01_치수평면도.svg');await page.screenshot({path:out+'/평면도_미리보기.png'});
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
