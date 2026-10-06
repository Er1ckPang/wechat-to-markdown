import {chromium} from '../outputs/wx2md-local-v1.2.0/node_modules/playwright/index.mjs';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {prepareCapture} from '../outputs/wx2md-local-v1.2.0/src/screenshot.mjs';
import {renderMarkdown,sanitizeMarkdownHtml} from '../outputs/wx2md-local-v1.2.0/src/markdown.mjs';
const base='http://127.0.0.1:17880',url='https://mp.weixin.qq.com/s/NfT-3GDq2sM2LNJlnXslYw';
const work=fileURLToPath(new URL('./',import.meta.url));
const proofDir=path.join(work,'proof-v120');await mkdir(proofDir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 const health=await(await context.request.get(base+'/health')).json();assert.equal(health.version,'1.2.0');assert.ok(health.root.includes('wx2md-local-v1.2.0'));
 const token=(await(await context.request.get(base+'/api/session')).json()).token,headers={'X-Wx2md-Token':token};
 const before=await(await context.request.get(base+'/api/status',{headers})).json();
 const oldRecords=JSON.parse(await readFile(path.join(work,'wx2md-v120-migration-records.json'),'utf8'));
 for(const old of oldRecords){const migrated=before.jobs.find(j=>j.id===old.id);assert.ok(migrated);assert.equal(migrated.output_dir,old.outputDir);assert.equal(migrated.status,old.status);}
 await page.goto(base);await page.locator('#service-version').getByText('正在运行 · v1.2.0',{exact:true}).waitFor();
 const resume=process.argv.includes('--existing');
 const submitted=resume?null:await(await context.request.post(base+'/api/jobs',{headers,data:{url,force:true}})).json();
 const id=resume?JSON.parse(await readFile(path.join(work,'wx2md-v120-current-job.json'),'utf8')).id:submitted.results[0].job.id;
 await writeFile(path.join(work,'wx2md-v120-current-job.json'),JSON.stringify({id}));
 let job,lastStage,latest;const deadline=Date.now()+310000;
 while(Date.now()<deadline){
  latest=await(await context.request.get(base+'/api/status',{headers})).json();job=latest.jobs.find(j=>j.id===id);
  if(job.stage!==lastStage){console.log(job.stage||job.status);lastStage=job.stage;}
  if(!['pending','processing'].includes(job.status))break;
  await new Promise(r=>setTimeout(r,1800));
 }
 await writeFile(path.join(work,'wx2md-v120-result.json'),JSON.stringify(job,null,2));
 assert.equal(job.status,'completed',JSON.stringify({status:job.status,error:job.error,warnings:job.metadata?.warnings}));
 const meta=job.metadata,names=meta.file_names,files=await readdir(job.output_dir);
 assert.deepEqual(files.sort(),Object.values(names).sort());assert.equal(files.length,5);
 assert.ok(files.every(f=>f.startsWith(job.title.replaceAll(':','_'))));
 assert.equal(meta.markdown_images.count,16);assert.equal(meta.offline_check.missingImages,0);assert.equal(meta.offline_check.embeddedImages,16);
 assert.equal(meta.html_images.linked,16);assert.deepEqual(meta.markdown_structure,{...meta.markdown_structure,headings:19,tables:3,formulas:3});
 const md=await readFile(path.join(job.output_dir,names.markdown),'utf8');
 const oldReport=JSON.parse(await readFile(path.join(work,'wx2md-v111-verification.json'),'utf8'));
 const embedded=[...md.matchAll(/^\[wx2md-image-\d+\]: data:([^;]+);base64,([A-Za-z0-9+/=]+)$/gm)];assert.equal(embedded.length,16);
 for(const [index,image]of embedded.entries()){
  const bytes=Buffer.from(image[2],'base64');const digest=createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest,oldReport.job.metadata.image_files[index].sha256);assert.equal(digest,meta.image_files[index].sha256);
 }
 for(const [name,info]of Object.entries(meta.files)){
  const bytes=await readFile(path.join(job.output_dir,name));assert.equal(bytes.length,info.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),info.sha256);
  if(name.endsWith('.png')){assert.equal(bytes.readUInt32BE(16),info.width);assert.equal(bytes.readUInt32BE(20),info.height);}
 }
 const fileBase=`${base}/files/${id}/`;
 for(const name of Object.values(names))assert.equal((await context.request.get(fileBase+encodeURIComponent(name))).status(),200);
 assert.equal((await context.request.get(fileBase+'article.md')).status(),404);
 assert.equal((await context.request.get(fileBase+'%2e%2e%5cpackage.json')).status(),404);
 await page.goto(fileBase+encodeURIComponent(names.html));
 await page.locator('#js_content img').first().click();await page.locator('#wx2md-original-001').waitFor({state:'visible'});
 assert.equal(await page.locator('#wx2md-original-001>img').evaluate(e=>e.naturalWidth),1080);
 const downloadPromise=page.waitForEvent('download');await page.locator('#wx2md-original-001 a[download]').click();const download=await downloadPromise;assert.equal(await download.failure(),null);
 const downloaded=await readFile(await download.path());assert.equal(createHash('sha256').update(downloaded).digest('hex'),meta.image_files[0].sha256);
 await page.locator('#wx2md-original-001 a').first().click();assert.equal(await page.locator('#wx2md-original-001').isVisible(),false);
 for(const profile of ['mobile','desktop']){
  await page.goto(`${base}/view/${id}/${profile}`);await page.locator('main img').evaluate(e=>e.decode());await page.locator('label[for=actual]').click();
  assert.equal(await page.locator('main img').evaluate(e=>e.getBoundingClientRect().width),meta.files[names[profile]].width);
 }
 const offline=await context.newPage();let blockedNetwork=0;
 await offline.route('**/*',route=>{if(/^https?:/.test(route.request().url())){blockedNetwork++;return route.abort();}return route.continue();});
 await offline.goto(pathToFileURL(path.join(job.output_dir,names.html)).href);
 const images=await offline.locator('#js_content img').evaluateAll(async list=>{await Promise.all(list.map(e=>e.decode()));return list.map(e=>e.naturalWidth);});assert.equal(images.length,16);assert.ok(images.every(Boolean));
 await offline.locator('#js_content img').first().click();assert.equal(await offline.locator('#wx2md-original-001').isVisible(),true);
 await offline.setContent('<article></article>');const rendered=await offline.evaluate(sanitizeMarkdownHtml,renderMarkdown(md));await offline.locator('article').evaluate((e,html)=>e.innerHTML=html,rendered);
 assert.equal(await offline.locator('article table').count(),3);assert.equal(await offline.locator('article img').count(),16);
 const markdownTableRows=await offline.locator('article table').evaluateAll(t=>t.map(t=>t.rows.length));assert.deepEqual(markdownTableRows,[9,8,9]);
 const mdWidths=await offline.locator('article img').evaluateAll(async list=>{await Promise.all(list.map(e=>e.decode()));return list.map(e=>e.naturalWidth);});assert.ok(mdWidths.every(Boolean));
 await offline.close();
 const proofs=[],profileLayouts={};
 for(const [name,profile]of Object.entries(meta.screenshot_profiles)){
  assert.equal(profile.check.complete,true);assert.equal(profile.check.maxOverlapDifference,0);assert.equal(profile.check.coveredRows,meta.files[profile.file].height);assert.equal(profile.check.horizontalChecks,0);
  const proofContext=await browser.newContext({viewport:{width:profile.viewport.width,height:profile.viewport.height},deviceScaleFactor:3});const proof=await proofContext.newPage();
  await proof.route('**/*',route=>/^https?:/.test(route.request().url())?route.abort():route.continue());
  await proof.goto(pathToFileURL(path.join(job.output_dir,names.html)).href);
  const layout=await prepareCapture(proof,3,[],{fitToViewport:true,cropToArticle:true,singleFile:true});
  assert.equal(layout.height,profile.check.layout.height);assert.equal(layout.crop.width*3,profile.check.pixelWidth);
  const tables=await proof.locator('#js_content table').evaluateAll(list=>list.map(e=>({rows:e.rows.length,columns:e.rows[0].cells.length,right:e.getBoundingClientRect().right,contentRight:document.querySelector('#js_content').getBoundingClientRect().right})));
  assert.ok(tables.every(t=>t.right<=t.contentRight+1));assert.deepEqual(tables.map(t=>t.rows),[9,8,9]);
  assert.equal(tables[0].columns,6);
  profileLayouts[name]={crop:layout.crop,viewportWidth:layout.viewportWidth,fittedTables:layout.fittedTables,tables};
  const formulaY=await proof.locator('#js_content [data-formula]').first().evaluate(e=>e.getBoundingClientRect().top).catch(()=>layout.height*0.75);
  const tableY=await proof.locator('#js_content table').first().evaluate(e=>e.getBoundingClientRect().top);
  const positions=[0,tableY-120,layout.height*0.5,formulaY-120,layout.height-layout.viewportHeight,profile.check.tiles[Math.min(10,profile.check.tiles.length-1)].top/3-160];
  for(const [index,y]of positions.entries()){
   await proof.evaluate(y=>scrollTo(0,Math.max(0,y)),y);await proof.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const actual=await proof.evaluate(()=>scrollY);const screen=path.join(proofDir,`${name}-${index}.png`);await proof.screenshot({path:screen,fullPage:false,scale:'device',animations:'disabled'});
   proofs.push({profile:name,finalPng:path.join(job.output_dir,profile.file),expected:screen,top:Math.round(actual*3),left:Math.round(layout.crop.left*3),width:Math.round(layout.crop.width*3),height:layout.viewportHeight*3});
  }
  await proofContext.close();
 }
 assert.equal(meta.files[names.mobile].width,1296);assert.ok(meta.files[names.desktop].width<1280*3);assert.ok(meta.files[names.desktop].width>1296);
 await page.goto(base);const card=page.locator(`.job[data-job-id="${id}"]`);await card.getByRole('link',{name:'手机长图 ↗',exact:true}).waitFor();await card.getByRole('link',{name:'电脑长图 ↗',exact:true}).waitFor();
 await page.screenshot({path:path.join(work,'wx2md-v120-app.png'),fullPage:false});
 await page.getByRole('button',{name:'保存设置',exact:true}).click();assert.ok((await page.locator('#runtime-root').textContent()).includes('wx2md-local-v1.2.0'));
 await page.screenshot({path:path.join(work,'wx2md-v120-settings.png'),fullPage:false});
 await page.goto(base+'/guide.html');assert.ok((await page.locator('#files').textContent()).includes('只有 5 个文件'));
 assert.equal((await context.request.post(base+'/api/config',{headers,data:{screenshotScale:5}})).status(),400);
 assert.equal((await context.request.post(base+'/api/jobs',{data:{url}})).status(),403);
 assert.equal((await context.request.post(base+'/api/jobs',{headers:{...headers,Origin:'https://other.test'},data:{url}})).status(),403);
 for(const old of oldRecords){const j=latest.jobs.find(j=>j.id===old.id);assert.equal(j.output_dir,old.outputDir);if(j.metadata?.html_files?.includes('original-singlefile.html'))assert.equal((await context.request.get(`${base}/files/${j.id}/original-singlefile.html`)).status(),200);}
 assert.deepEqual(errors,[]);
 const report={version:'1.2.0',verified_at:new Date().toISOString(),job,profileLayouts,proofs,checks:{exactFiveFiles:true,titleNamed:true,oldRecordsPreserved:oldRecords.length,imageBytesUnchanged:true,htmlOriginalView:true,htmlOriginalDownload:true,offlineHtml:true,offlineMdImages:true,markdownHeadings:19,markdownTables:3,markdownTableRows,markdownFormulas:3,markdownImages:16,dualSinglePng:true,allColumnsPreserved:true,noExtraHorizontalCanvas:true,fullPixelViewers:true,uiErrors:errors,blockedNetwork,invalidScaleRejected:true,unauthorizedWriteRejected:true,crossSiteWriteRejected:true},feishuRealDelivery:'not_tested',macRuntime:'not_tested'};
 await writeFile(path.join(work,'wx2md-v120-verification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({title:job.title,outputDir:job.output_dir,files:meta.files,profileLayouts,checks:report.checks},null,2));
}finally{await browser.close();}
