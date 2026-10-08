import {readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {launchBrowser} from '../../local-archive/src/browser.mjs';

const repo=fileURLToPath(new URL('../../',import.meta.url)),app=path.join(repo,'local-archive');
const packageInfo=JSON.parse(await readFile(path.join(app,'package.json'),'utf8'));
const version=packageInfo.releaseVersion||packageInfo.version;
const base='http://127.0.0.1:17880';
const health=await(await fetch(base+'/health')).json();
assert.equal(health.version,version);assert.equal(path.resolve(health.root),path.resolve(app));
const token=(await(await fetch(base+'/api/session')).json()).token;
const status=await(await fetch(base+'/api/status',{headers:{'X-Wx2md-Token':token}})).json();
const migration=JSON.parse(await readFile(path.join(app,'data/reorganization.json'),'utf8'));
assert.equal(status.jobs.length,migration.jobs);
let fileChecks=0,mdChecks=0,imageChecks=0;
for(const job of status.jobs){
 if(!job.output_dir)continue;
 assert.ok(path.resolve(job.output_dir).startsWith(path.resolve(app,'archives')+path.sep));
 const names=job.metadata?.file_names;
 const mdName=names?.markdown||'article.md';
 const mdResponse=await fetch(`${base}/files/${job.id}/${encodeURIComponent(mdName)}`);
 assert.equal(mdResponse.status,200);const md=await mdResponse.text();assert.ok(md.length);mdChecks++;
 for(const [file,info]of Object.entries(job.metadata?.files||{})){
  const value=await stat(path.join(job.output_dir,file));assert.equal(value.size,info.bytes);fileChecks++;
 }
 const images=[...new Set([...md.matchAll(/!\[[^\]]*\]\((images\/\d+\.[a-z]+)\)/g)].map(m=>m[1]))];
 for(const image of images){const response=await fetch(`${base}/files/${job.id}/${image}`);assert.equal(response.status,200);const bytes=await response.arrayBuffer();assert.ok(bytes.byteLength);imageChecks++;}
 if(names&&job.metadata.screenshot_profiles){
  for(const profile of ['mobile','desktop'])assert.equal((await fetch(`${base}/view/${job.id}/${profile}`)).status,200);
 }
}
const browser=await launchBrowser();
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('#service-version').getByText(`正在运行 · v${version}`,{exact:true}).waitFor();
 await page.getByRole('button',{name:'保存设置',exact:true}).click();assert.equal(path.resolve(await page.locator('#runtime-root').textContent()),path.resolve(app));
 for(const url of [base+'/guide.html',base+'/mac-guide.html']){await page.goto(url);assert.ok((await page.locator('body').textContent()).includes(version));}
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
const report={release:`v${version}`,displayVersion:health.version,packageVersion:packageInfo.version,recordsPreserved:status.jobs.length,migratedArticleDirectories:migration.articleDirectoriesCopied,migratedFilesVerified:migration.filesVerified,servedMarkdowns:mdChecks,servedLocalImages:imageChecks,metadataFileChecks:fileChecks,uiErrors:errors};
await writeFile(path.join(app,'data/baseline-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
