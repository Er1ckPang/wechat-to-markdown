import {chromium} from '../outputs/wx2md-local-v1.2.1/node_modules/playwright/index.mjs';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {renderMarkdown,sanitizeMarkdownHtml} from '../outputs/wx2md-local-v1.2.1/src/markdown.mjs';
const work=fileURLToPath(new URL('./',import.meta.url)),base='http://127.0.0.1:17880';
const url='https://mp.weixin.qq.com/s/NfT-3GDq2sM2LNJlnXslYw';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const health=await(await page.request.get(base+'/health')).json();assert.equal(health.version,'1.2.1');
 const token=(await(await page.request.get(base+'/api/session')).json()).token,headers={'X-Wx2md-Token':token};
 const previous=JSON.parse(await readFile(path.join(work,'wx2md-v121-migration-records.json'),'utf8'));
 const before=await(await page.request.get(base+'/api/status',{headers})).json();
 for(const old of previous){const current=before.jobs.find(j=>j.id===old.id);assert.ok(current);assert.equal(current.output_dir,old.outputDir);}
 const resumed=process.argv.includes('--existing');
 const submission=resumed?null:await(await page.request.post(base+'/api/jobs',{headers,data:{url,force:true}})).json();
 const id=resumed?JSON.parse(await readFile(path.join(work,'wx2md-v121-current-job.json'),'utf8')).id:submission.results[0].job.id;
 await writeFile(path.join(work,'wx2md-v121-current-job.json'),JSON.stringify({id}));
 let job,lastStage;const deadline=Date.now()+310000;
 while(Date.now()<deadline){
  const status=await(await page.request.get(base+'/api/status',{headers})).json();job=status.jobs.find(j=>j.id===id);
  if(job.stage!==lastStage){console.log(job.stage||job.status);lastStage=job.stage;}
  if(!['pending','processing'].includes(job.status))break;
  await new Promise(r=>setTimeout(r,1800));
 }
 assert.equal(job.status,'completed',JSON.stringify({status:job.status,error:job.error,warnings:job.metadata?.warnings}));
 const meta=job.metadata,names=meta.file_names;
 assert.equal(meta.tool_version,'1.2.1');assert.equal(meta.markdown_images.mode,'local-originals');assert.equal(meta.markdown_images.count,16);
 assert.deepEqual((await readdir(job.output_dir)).sort(),[...Object.values(names),'images'].sort());
 assert.equal((await readdir(path.join(job.output_dir,'images'))).length,16);
 const md=await readFile(path.join(job.output_dir,names.markdown),'utf8');assert.ok(!md.includes('data:image/'));
 assert.equal([...md.matchAll(/!\[[^\]]*\]\(images\/\d+\.[a-z]+\)/g)].length,16);
 const old=JSON.parse(await readFile(path.join(work,'wx2md-v120-verification.json'),'utf8'));
 for(const [index,image]of meta.image_files.entries()){
  const bytes=await readFile(path.join(job.output_dir,image.path));assert.equal(digest(bytes),image.sha256);assert.equal(image.sha256,old.job.metadata.image_files[index].sha256);
  const response=await page.request.get(`${base}/files/${id}/${image.path}`);assert.equal(response.status(),200);assert.equal(digest(await response.body()),image.sha256);
 }
 const rejected=['images/999.jpg','images/%2e%2e%5cpackage.json','images/001.jpg%5c..%5c..%5cdata%5cconfig.json'];
 for(const name of rejected)assert.equal((await page.request.get(`${base}/files/${id}/${name}`)).status(),404);
 await page.route('**/*',route=>/^https?:/.test(route.request().url())?route.abort():route.continue());
 await page.goto(pathToFileURL(path.join(job.output_dir,names.html)).href);
 const htmlImages=await page.locator('#js_content img').evaluateAll(async images=>{await Promise.all(images.map(i=>i.decode()));return images.map(i=>({src:i.getAttribute('src'),width:i.naturalWidth}));});
 assert.equal(htmlImages.length,16);assert.ok(htmlImages.every(i=>i.width&&i.src.startsWith('data:image/')));
 await page.locator('#js_content img').first().click();assert.equal(await page.locator('#wx2md-original-001').isVisible(),true);
 assert.equal(meta.offline_check.missingImages,0);
 const rendered=await page.evaluate(sanitizeMarkdownHtml,renderMarkdown(md));
 const preview=path.join(work,'qa-v121-md-preview.html');
 await writeFile(preview,`<!doctype html><meta charset="utf-8"><base href="${pathToFileURL(job.output_dir+path.sep).href}"><article>${rendered}</article>`,'utf8');
 await page.goto(pathToFileURL(preview).href);
 const widths=await page.locator('article img').evaluateAll(async images=>{await Promise.all(images.map(i=>i.decode()));return images.map(i=>i.naturalWidth);});assert.equal(widths.length,16);assert.ok(widths.every(Boolean));
 assert.equal(await page.locator('article table').count(),3);assert.equal(meta.markdown_structure.headings,19);assert.equal(meta.markdown_structure.formulas,3);
 for(const [name,info]of Object.entries(meta.files)){const bytes=await readFile(path.join(job.output_dir,name));assert.equal(digest(bytes),info.sha256);assert.equal(bytes.length,info.bytes);}
 for(const profile of Object.values(meta.screenshot_profiles)){assert.equal(profile.check.complete,true);assert.equal(profile.check.coveredRows,meta.files[profile.file].height);assert.equal(profile.check.maxOverlapDifference,0);}
 await page.unroute('**/*');await page.goto(base);await page.locator('#service-version').getByText('正在运行 · v1.2.1',{exact:true}).waitFor();
 assert.ok((await page.locator('.intro').textContent()).includes('images'));
 assert.deepEqual(errors,[]);
 const report={version:'1.2.1',verified_at:new Date().toISOString(),job,checks:{topLevelFiles:5,imagesFolder:true,localReferences:16,noMarkdownBase64:true,originalImageBytesUnchanged:true,imageFilesServed:true,unlistedAndTraversalFilesRejected:true,htmlStillEmbedded:true,htmlOfflineImages:16,htmlOriginalView:true,markdownOfflineImages:16,markdownTables:3,markdownFormulas:3,dualPngComplete:true,seamsVerified:true,oldRecordsPreserved:previous.length,uiErrors:errors}};
 await writeFile(path.join(work,'wx2md-v121-verification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({outputDir:job.output_dir,markdownBytes:meta.files[names.markdown].bytes,checks:report.checks},null,2));
}finally{await browser.close();}
