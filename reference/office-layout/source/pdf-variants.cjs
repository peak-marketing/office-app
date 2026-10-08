const {chromium}=require('playwright-core');const fs=require('fs'),path=require('path');
(async()=>{
 const out=path.resolve(__dirname,'../output');const b=await require('./browser.cjs').launchBrowser({headless:true});const p=await b.newPage({viewport:{width:1588,height:1123}});
 for(const s of require('./styles.json')){const dir=path.join(out,s.code+'_'+s.name);await p.goto('file://'+dir+'/업체전달용_인쇄.html');await p.evaluate(()=>document.fonts.ready);await p.pdf({path:dir+'/배치검토안.pdf',printBackground:true,preferCSSPageSize:true});}
 await p.goto('file://'+out+'/3가지스타일_인쇄.html');await p.evaluate(()=>document.fonts.ready);await p.pdf({path:out+'/03_업체전달용_배치검토안.pdf',printBackground:true,preferCSSPageSize:true});fs.copyFileSync(out+'/03_업체전달용_배치검토안.pdf',out+'/05_3가지스타일_비교도면.pdf');
 const qa=path.resolve(__dirname,'검토기록');fs.mkdirSync(qa,{recursive:true});
 await p.locator('.page').first().screenshot({path:out+'/3가지스타일_한눈에보기.png'});
 await p.locator('.page').nth(4).screenshot({path:qa+'/시크_PDF.png'});await p.locator('.page').nth(6).screenshot({path:qa+'/러블리_PDF.png'});
 console.log(await p.locator('.page').evaluateAll(es=>es.map(e=>({height:e.offsetHeight,scroll:e.scrollHeight}))));
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
