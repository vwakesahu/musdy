import { chromium } from '/private/tmp/claude-501/pw/node_modules/playwright/index.mjs';
const pages=[['home','/'],['prices','/prices'],['blog-announcing-fomo-web','/blog/announcing-fomo-web'],['release-notes','/release-notes'],['blog-index','/blog'],['memecoins','/crypto/memecoins'],['answers','/answers']];
const b=await chromium.launch();
for(const [w,h,n] of [[390,844,'m'],[1440,900,'d']]){
 const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:w<500});
 const p=await c.newPage();
 for(const [name,path] of pages){
  try{await p.goto('https://fomo.family'+path,{waitUntil:'networkidle',timeout:45000});await p.waitForTimeout(1500);
  await p.screenshot({path:`${name}-${n}.png`,fullPage:name.startsWith('blog-a')});}catch(e){console.log('fail',name,e.message)}
 }
}
await b.close();
