import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { launchBrowser } from '../src/browser.mjs';
import { inspectLinkState, migrationTarget, NeedsManualError, InvalidArticleError } from '../src/link-state.mjs';
import { archiveArticle } from '../src/archive.mjs';
import { Store } from '../src/store.mjs';
import { Worker } from '../src/worker.mjs';

test('失效提示分类；验证码和限流不误判；正文引用删除或迁移提示仍为文章',async()=>{
  const browser=await launchBrowser();try{const page=await browser.newPage();
    for(const [text,reason] of [['该内容已被发布者删除','deleted'],['链接已过期','expired'],['此内容涉嫌侵权，无法查看','copyright'],['该内容因违规无法查看','removed'],['此账号已自主注销，内容无法查看','account_removed']]){
      await page.setContent(`<div class="weui-msg"><h1>${text}</h1></div>`);const state=await page.evaluate(inspectLinkState,{platform:'wechat'});assert.equal(state.state,'invalid');assert.equal(state.reason,reason);
    }
    await page.setContent('<div class="weui-msg">环境异常，请完成验证，此内容无法查看</div>');assert.equal((await page.evaluate(inspectLinkState,{platform:'wechat'})).state,'unknown');
    await page.setContent('<div class="weui-msg">访问过于频繁，此内容无法查看</div>');assert.equal((await page.evaluate(inspectLinkState,{platform:'wechat'})).state,'throttled');
    await page.setContent('<div id="js_content">一篇介绍“该内容已被发布者删除”和“该公众号已迁移”的教程。</div>');assert.equal((await page.evaluate(inspectLinkState,{platform:'wechat'})).state,'article');
    await page.setContent('<title>Not found</title>');assert.equal((await page.evaluate(inspectLinkState,{platform:'web',httpStatus:404})).state,'invalid');
    assert.equal((await page.evaluate(inspectLinkState,{platform:'web',httpStatus:403})).state,'unknown');
    assert.equal((await page.evaluate(inspectLinkState,{platform:'web',httpStatus:429})).state,'throttled');
    assert.equal(migrationTarget('http://mp.weixin.qq.com/s?__biz=test&mid=123&idx=1&sn=x#wechat_redirect','https://mp.weixin.qq.com/s/old'),'https://mp.weixin.qq.com/s?__biz=test&mid=123&idx=1&sn=x');
    for(const url of ['https://example.com/a','http://127.0.0.1/a','javascript:alert(1)','https://mp.weixin.qq.com/other','https://u:p@mp.weixin.qq.com/s/new'])assert.throws(()=>migrationTarget(url,'https://mp.weixin.qq.com/s/old'),NeedsManualError);
  }finally{await browser.close();}
});

test('迁移文章完整保存：实体链接、二次JS跳转、迁移记录；失效/循环/非法迁移不落盘', {timeout:120000},async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'wx2md-link-state-'));
  const article='<style>body{margin:0}.rich_media_area_primary_inner{max-width:680px;margin:20px auto;padding:20px}</style><main class="rich_media_area_primary_inner"><h1 id="activity-name">迁移测试</h1><span id="js_name">测试公众号</span><div id="js_content"><h2>新正文</h2><p>自行编写的迁移文章内容。</p><p style="height:1000px">完整结尾</p></div></main>';
  const migration=href=>`<title>账号已迁移</title><div class="weui-msg"><h1>该公众号已迁移</h1><a id="js_access_msg" href="${href}">访问文章</a></div>`;
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if(req.url==='/deleted')return res.end('<div class="weui-msg">该内容已被发布者删除</div>');
    if(req.url==='/404'){res.statusCode=404;return res.end('not found');}
    if(req.url==='/loop')return res.end(migration('/loop'));
    if(req.url==='/external')return res.end(migration('https://example.com/article'));
    if(req.url==='/missing')return res.end(migration(''));
    if(req.url==='/delayed')return res.end('<script>setTimeout(()=>location.href="/new?from=old&ok=1",250)</script>');
    if(req.url==='/gate')return res.end('<div class="weui-msg">环境异常，请完成验证</div>');
    if(req.url==='/moved-gate')return res.end(migration('/gate'));
    if(req.url==='/old')return res.end(migration('/delayed'));
    if(req.url.startsWith('/new'))return res.end(article);
    if(req.url.startsWith('/chain/'))return res.end(migration('/chain/'+(Number(req.url.split('/').pop())+1)));
    res.end(article);
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    const archive=url=>archiveArticle({id:randomUUID(),url:origin+url},{archiveDir:temp,screenshotScale:1},()=>{},{fixtureOrigin:origin});
    const result=await archive('/old');assert.equal(result.status,'completed');assert.equal(result.metadata.link_state,'migrated');assert.equal(result.metadata.migrations.length,1);
    assert.equal(result.metadata.original_url,origin+'/old');assert.equal(result.metadata.resolved_url,origin+'/new?from=old&ok=1');
    assert.match(await readFile(path.join(result.outputDir,result.metadata.file_names.markdown),'utf8'),/新正文/);
    assert.doesNotMatch(await readFile(path.join(result.outputDir,result.metadata.file_names.html),'utf8'),/该公众号已迁移/);
    for(const profile of Object.values(result.metadata.screenshot_profiles)){assert.equal(profile.check.complete,true);assert.equal(profile.check.maxOverlapDifference,0);}
    for(const url of ['/deleted','/404'])await assert.rejects(archive(url),InvalidArticleError);
    for(const [url,pattern] of [['/loop',/循环/],['/external',/不是微信/],['/missing',/没有提供/],['/chain/0',/超过 5/]])await assert.rejects(archive(url),e=>e instanceof NeedsManualError&&pattern.test(e.message));
    await assert.rejects(archive('/moved-gate'),e=>e instanceof NeedsManualError&&e.details.link_state==='migrated'&&e.details.resolved_url===origin+'/gate');
    const store=new Store(path.join(temp,'worker.sqlite'));
    let active=0,maxActive=0;
    const worker=new Worker(store,()=>({archiveDir:temp,screenshotScale:1,concurrency:2}),{startGap:1,archive:async(job,config,onStage,options)=>{
      active++;maxActive=Math.max(maxActive,active);
      try{return await archiveArticle({...job,url:origin+'/new'},config,onStage,{...options,fixtureOrigin:origin});}finally{active--;}
    }});
    try{
      store.enqueueBatch(['https://mp.weixin.qq.com/s/parallel-a','https://mp.weixin.qq.com/s/parallel-b']);worker.start();
      const deadline=Date.now()+30000;while((store.pending().length||worker.busy)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
      assert.equal(maxActive,2);assert.deepEqual(store.stats(),{completed:2});
      for(const job of store.list()){assert.equal(job.metadata.offline_check.missingImages,0);for(const profile of Object.values(job.metadata.screenshot_profiles))assert.equal(profile.check.complete,true);}
    }finally{worker.stop();store.close();}
    assert.equal((await readdir(path.join(temp,'.staging'))).length,0);
  }finally{await new Promise(resolve=>server.close(resolve));if(path.dirname(temp)===os.tmpdir()&&path.basename(temp).startsWith('wx2md-link-state-'))await rm(temp,{recursive:true,force:true});}
});
