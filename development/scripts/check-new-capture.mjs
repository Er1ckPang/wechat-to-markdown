import { chromium } from '../outputs/wx2md-local-v1.1.1/node_modules/playwright/index.mjs';
import { captureScreenshot } from '../outputs/wx2md-local-v1.1.1/src/screenshot.mjs';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const job=JSON.parse(await readFile('work/wx2md-v110-result.json','utf8'));
const directory=path.resolve('work/capture-v111-proof');await mkdir(directory,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:430,height:900},deviceScaleFactor:3});
 await page.route('**/*',r=>/^https?:/.test(r.request().url())?r.abort():r.continue());
 await page.goto(pathToFileURL(path.join(job.output_dir,'original.html')).href);
 let last='';
 const result=await captureScreenshot(page,directory,[],3,stage=>{if(stage!==last){console.log(stage);last=stage;}});
 const samples=[];
 for(const y of [0,7344,14688,result.check.layout.height-900,...result.check.tiles.slice(1,3).map(tile=>Math.floor(tile.top/3)-450)]){
  await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(100);
  const position=await page.evaluate(()=>({x:scrollX,y:scrollY}));
  const file=path.join(directory,`viewport-${samples.length}.png`);
  await page.screenshot({path:file,scale:'device'});samples.push({file,...position});
 }
 await writeFile(path.join(directory,'proof.json'),JSON.stringify({...result,samples},null,2));
 console.log(JSON.stringify({...result.check,tiles:result.check.tiles.length},null,2));
}finally{await browser.close();}
