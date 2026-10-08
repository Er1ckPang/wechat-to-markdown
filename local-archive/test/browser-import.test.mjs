import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { launchBrowser } from '../src/browser.mjs';
import { receiveImport, readBrowserImport, MAX_IMPORT_BYTES } from '../src/browser-import.mjs';
import { archiveArticle } from '../src/archive.mjs';
import { Store } from '../src/store.mjs';

const source='https://mp.weixin.qq.com/s/browser-import-fixture';
const imageUrl='https://mmbiz.qpic.cn/import-fixture.gif';
const gif=await readFile(new URL('./fixtures/animated/two-frames.gif',import.meta.url));
const html=src=>`<!doctype html><html><head><meta charset="utf-8"><link rel="canonical" href="${source}"><style>body{margin:0}.rich_media_area_primary_inner{max-width:680px;margin:20px auto;padding:20px}#js_content p{line-height:1.8}</style></head><body><main class="rich_media_area_primary_inner"><h1 id="activity-name">普通浏览器导入测试</h1><span id="js_name">测试公众号</span><div id="js_content"><h2>保留正文结构</h2><p>自主编写的正文，用于检验离线读取保存的网页。</p><img src="${src}" data-src="https://mmbiz.qpic.cn/not-saved-lazy.gif"><p style="height:1300px">完整结尾</p></div></main><script>document.body.dataset.executed='yes'</script></body></html>`;
const fixture=async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'wx2md-import-'));
  return {temp,directory:pathToFileURL(temp+path.sep),cleanup:async()=>{if(path.dirname(temp)===os.tmpdir()&&path.basename(temp).startsWith('wx2md-import-'))await rm(temp,{recursive:true,force:true});}};
};

test('MHTML 原图无损离线导入，生成全部归档并保留旧任务迁移信息',{timeout:60000},async()=>{
  const f=await fixture(),browser=await launchBrowser();let store;
  try {
    const context=await browser.newContext();await context.route('**/*',route=>route.fulfill({status:200,contentType:route.request().url()===imageUrl?'image/gif':'text/html; charset=utf-8',body:route.request().url()===imageUrl?gif:html(imageUrl)}));
    const page=await context.newPage();await page.goto(source);await page.evaluate(()=>document.querySelector('img').decode());
    const cdp=await context.newCDPSession(page),snapshot=await cdp.send('Page.captureSnapshot',{format:'mhtml'});await context.close();
    const descriptor=await receiveImport([Buffer.from(snapshot.data)],'测试.mhtml',f.directory);
    const imported=await readBrowserImport(browser,descriptor,source,f.directory);
    assert.equal(imported.resources.get(imageUrl).bytes.equals(gif),true);assert.doesNotMatch(imported.html,/<script|onload=/i);
    await browser.close();
    store=new Store(path.join(f.temp,'jobs.sqlite'));const old=store.enqueue('https://mp.weixin.qq.com/s/old-import').job;
    const migrations=[{from:old.url,to:source,type:'wechat_account_migration'}];store.update(old.id,{status:'needs_manual',metadata:{migrations,resolved_url:source,requires_verification:true}});
    const job=store.enqueueImport(source,descriptor,old.id);assert.equal(job.id,old.id);assert.equal(job.metadata.verification_requested,false);
    const result=await archiveArticle(job,{archiveDir:path.join(f.temp,'archives'),screenshotScale:1},()=>{},{importDirectory:f.directory});
    assert.equal(result.status,'completed',JSON.stringify({warnings:result.metadata.warnings,failed:result.metadata.failed_resources}));assert.deepEqual(result.metadata.migrations,migrations);assert.equal(result.metadata.browser_import.network_used,false);assert.equal(result.metadata.offline_check.missingImages,0);
    assert.equal(result.metadata.image_files.length,1);assert.equal((await readFile(path.join(result.outputDir,'images/001.gif'))).equals(gif),true);
    assert.match(await readFile(path.join(result.outputDir,result.metadata.file_names.markdown),'utf8'),/images\/001.gif/);
    assert.match(await readFile(path.join(result.outputDir,result.metadata.file_names.html),'utf8'),/data:image\/gif;base64/);
    for(const profile of Object.values(result.metadata.screenshot_profiles)){assert.equal(profile.check.complete,true);assert.equal(profile.check.maxOverlapDifference,0);}
    store.update(job.id,{status:result.status,metadata:result.metadata,output_dir:result.outputDir});
    const retry=store.retry(job.id),repeated=await archiveArticle(retry,{archiveDir:path.join(f.temp,'archives'),screenshotScale:1},()=>{},{importDirectory:f.directory});
    assert.equal(repeated.status,'completed');assert.equal(repeated.metadata.resolved_url,source);assert.deepEqual(repeated.metadata.migrations,migrations);assert.equal((await readFile(path.join(repeated.outputDir,'images/001.gif'))).equals(gif),true);
  } finally {store?.close();await browser.close().catch(()=>{});await f.cleanup();}
});

test('内嵌 HTML 导入；阻止错误链接、验证页和本地文件资源',{timeout:60000},async()=>{
  const f=await fixture();let browser;
  try {
    const sourceHtml=html('data:image/gif;base64,'+gif.toString('base64'));
    const descriptor=await receiveImport([Buffer.from(sourceHtml)],'内嵌.html',f.directory);
    const result=await archiveArticle({id:randomUUID(),url:source,metadata:{browser_import:descriptor}},{archiveDir:path.join(f.temp,'archives'),screenshotScale:1},()=>{},{importDirectory:f.directory});
    assert.equal(result.status,'completed',JSON.stringify({warnings:result.metadata.warnings,failed:result.metadata.failed_resources}));assert.equal(result.metadata.offline_check.missingImages,0);assert.equal((await readFile(path.join(result.outputDir,'images/001.gif'))).equals(gif),true);
    browser=await launchBrowser();await assert.rejects(readBrowserImport(browser,descriptor,'https://mp.weixin.qq.com/s/different',f.directory),/文章地址与填写的链接不同/);
    const localPath=path.join(f.temp,'private.gif');await writeFile(localPath,gif);
    const unsafe=await receiveImport([Buffer.from(html(pathToFileURL(localPath).href))],'local.html',f.directory);
    const snapshot=await readBrowserImport(browser,unsafe,source,f.directory);assert.equal(snapshot.resources.size,0);assert.doesNotMatch(snapshot.html,/file:/);
    const gate=await receiveImport([Buffer.from('<title>访问验证</title><div class="weui-msg">环境异常 去验证</div>')],'gate.html',f.directory);
    await assert.rejects(archiveArticle({id:randomUUID(),url:source,metadata:{browser_import:gate}},{archiveDir:path.join(f.temp,'archives')},()=>{},{importDirectory:f.directory}),/没有可识别的文章正文/);
  } finally {await browser?.close();await f.cleanup();}
});

test('导入文件大小、类型、空内容和内容变化校验',async()=>{
  const f=await fixture();let browser;
  try {
    await assert.rejects(receiveImport([Buffer.from('x')],'x.exe',f.directory),/请选择 MHTML/);
    await assert.rejects(receiveImport([],'x.html',f.directory),/为空/);
    async function* tooLarge(){const chunk=Buffer.alloc(1024*1024);for(let i=0;i<=MAX_IMPORT_BYTES/chunk.length;i++)yield chunk;}
    await assert.rejects(receiveImport(tooLarge(),'x.mhtml',f.directory),/超过 64 MB/);
    const descriptor=await receiveImport([Buffer.from(html(''))],'x.html',f.directory);await writeFile(new URL(descriptor.id+descriptor.extension,f.directory),'changed');
    browser=await launchBrowser();await assert.rejects(readBrowserImport(browser,descriptor,source,f.directory),/已发生变化/);
  } finally {await browser?.close();await f.cleanup();}
});
