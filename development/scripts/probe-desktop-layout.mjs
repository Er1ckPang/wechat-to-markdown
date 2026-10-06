import {chromium}from'../outputs/wx2md-local-v1.1.1/node_modules/playwright/index.mjs';
import{readFile}from'node:fs/promises';import path from'node:path';import{pathToFileURL}from'node:url';
const report=JSON.parse(await readFile('work/wx2md-v111-verification.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const width of [432,1280]){
  const page=await browser.newPage({viewport:{width,height:720}});await page.route('**/*',r=>/^https?:/.test(r.request().url())?r.abort():r.continue());
  await page.goto(pathToFileURL(path.join(report.job.output_dir,'original-singlefile.html')).href);
  console.log(JSON.stringify(await page.evaluate(()=>({viewport:innerWidth,elements:['#js_article','.rich_media','.rich_media_inner','.rich_media_area_primary','.rich_media_area_primary_inner','#js_content','#activity-name','#js_name'].map(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect(),st=getComputedStyle(e);return {selector:s,tag:e.tagName,rect:{x:r.x,y:r.y,width:r.width,height:r.height},width:st.width,maxWidth:st.maxWidth,padding:st.padding,display:st.display};}),parents:(()=>{let e=document.querySelector('#js_content'),a=[];while(e){a.push({tag:e.tagName,id:e.id,class:e.className});e=e.parentElement;}return a;})()})),null,2));await page.close();
 }
}finally{await browser.close();}
