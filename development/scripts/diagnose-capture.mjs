import { chromium } from '../outputs/wx2md-local-v1.1.0/node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const base='http://127.0.0.1:17880';
const token=(await (await fetch(base+'/api/session')).json()).token;
const status=await (await fetch(base+'/api/status',{headers:{'X-Wx2md-Token':token}})).json();
const browser=await chromium.launch({channel:'msedge',headless:true});
const reports=[];
try {
 for (const job of status.jobs.filter(j=>j.output_dir).slice(0,2)) {
  const meta=job.metadata; const scale=meta.viewport.deviceScaleFactor||1;
  const page=await browser.newPage({viewport:{width:meta.viewport.width,height:900},deviceScaleFactor:scale});
  await page.route('**/*',r=>/^https?:/.test(r.request().url())?r.abort():r.continue());
  await page.goto(pathToFileURL(path.join(job.output_dir,'original.html')).href);
  const layout=await page.evaluate(async()=>{
   await Promise.all([...document.querySelectorAll('#js_content img')].map(i=>i.decode().catch(()=>{})));
   const rect=e=>{const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};};
   return {height:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight),width:document.documentElement.scrollWidth,
    fixed:[...document.querySelectorAll('body *')].filter(e=>['fixed','sticky'].includes(getComputedStyle(e).position)&&e.getBoundingClientRect().height>0).map(e=>({tag:e.tagName,id:e.id,cls:e.className,rect:rect(e)})).slice(0,15),
    tables:[...document.querySelectorAll('#js_content table')].map(e=>({text:e.textContent.slice(0,80),rect:rect(e),scroll:e.scrollWidth,parents:[e.parentElement,e.parentElement.parentElement].map(p=>({tag:p.tagName,rect:rect(p),scroll:p.scrollWidth,overflow:getComputedStyle(p).overflow}))})),
    images:[...document.querySelectorAll('#js_content img')].map(e=>({rect:rect(e),width:e.naturalWidth,height:e.naturalHeight,src:e.getAttribute('src').slice(0,50)}))};
  });
  const samples=[]; const targets=[0,Math.floor(layout.height/3),Math.floor(layout.height*2/3),layout.height-900];
  const folder=path.resolve('work/capture-diagnosis',job.id); await mkdir(folder,{recursive:true});
  for(const [i,y]of targets.entries()){
   await page.evaluate(y=>scrollTo(0,y),y); await page.waitForTimeout(150);
   const actualY=await page.evaluate(()=>scrollY);
   const file=path.join(folder,`viewport-${i}.png`); await page.screenshot({path:file,scale:'device'});
   samples.push({file,y:actualY});
  }
  reports.push({id:job.id,title:job.title,png:path.join(job.output_dir,'original.png'),scale,layout,samples});
  await page.close();
 }
 await writeFile('work/capture-diagnosis.json',JSON.stringify(reports,null,2));
 console.log(JSON.stringify(reports.map(r=>({title:r.title,scale:r.scale,height:r.layout.height,fixed:r.layout.fixed,tables:r.layout.tables,images:r.layout.images.length})),null,2));
}finally{await browser.close();}
