import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { launchBrowser } from '../src/browser.mjs';

async function fixture(t) {
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'wx2md-records-'))),store=new Store(path.join(root,'jobs.sqlite'));
  t.after(async()=>{store.close();assert.equal(path.dirname(root),await realpath(os.tmpdir()));assert.ok(path.basename(root).startsWith('wx2md-records-'));await rm(root,{recursive:true,force:true});});return store;
}
test('10000 条分页无重复，筛选覆盖上限外旧记录，摘要仅包含活跃任务',async t=>{
  const store=await fixture(t),insert=store.db.prepare('INSERT INTO jobs(id,article_key,url,source,status,title,created_at,updated_at,metadata) VALUES(?,?,?,?,?,?,?,?,?)');
  store.db.exec('BEGIN');
  for(let n=0;n<10005;n++)insert.run(String(n),String(n),`https://mp.weixin.qq.com/s/fixture-${n}`,'manual','completed',`文章 ${n}`,'2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z',JSON.stringify({site:'wechat',account:n===0?'旧公众号':'作者',screenshot_profiles:{mobile:{check:{tiles:['large-private-payload']}}}}));
  store.db.exec('COMMIT');
  const first=store.records({pageSize:100});assert.equal(first.matched,10005);assert.equal(first.accessible,10000);assert.equal(first.capped,true);assert.equal(first.pages,100);assert.equal(first.jobs[0].id,'10004');assert.equal(first.jobs[0].metadata.screenshot_profiles,undefined);
  const ids=new Set();for(let page=1;page<=100;page++)for(const job of store.records({page,pageSize:100}).jobs){assert.equal(ids.has(job.id),false);ids.add(job.id);}assert.equal(ids.size,10000);assert.equal(ids.has('0'),false);
  assert.equal(store.records({account:'旧公众号'}).jobs[0].id,'0');assert.equal(store.records({q:'fixture-0'}).matched,1);
  const last=store.records({page:10000,pageSize:37});assert.equal(last.page,271);assert.equal(last.jobs.length,10);
  assert.equal(store.active().length,0);
  store.db.prepare("UPDATE jobs SET status='pending' WHERE CAST(id AS INTEGER)<14").run();store.db.prepare("UPDATE jobs SET status='processing' WHERE id='13'").run();
  assert.equal(store.records({group:'active'}).matched,14);assert.equal(store.active().length,12);assert.equal(store.active()[0].id,'13');assert.ok(store.active().every(job=>['pending','processing'].includes(job.status)));
  assert.equal(store.records({site:'wechat',source:'manual',account:'旧公众号',status:'pending'}).matched,1);
});
test('筛选日期使用北京时间且包含当天，关键词按字面匹配，错误参数被拒绝',async t=>{
  const store=await fixture(t);
  const a=store.enqueue('https://www.cnblogs.com/fixture/p/123.html','feishu').job;
  store.update(a.id,{status:'partial',title:'100%_明确',metadata:{site:'cnblogs',author:'某作者'}});
  store.db.prepare('UPDATE jobs SET created_at=? WHERE id=?').run('2026-10-07T16:00:00.000Z',a.id);
  const b=store.enqueue('https://blog.csdn.net/fixture/article/details/123','manual').job;store.update(b.id,{status:'failed',title:'1000X明确'});
  assert.equal(store.records({q:'%_'}).matched,1);assert.equal(store.records({q:"' OR 1=1 --"}).matched,0);
  assert.equal(store.records({from:'2026-10-08',to:'2026-10-08',source:'feishu'}).matched,1);assert.equal(store.records({to:'2026-10-07',source:'feishu'}).matched,0);
  assert.equal(store.records({group:'saved'}).matched,1);assert.equal(store.records({group:'attention'}).matched,2);
  assert.equal(store.records({site:'csdn'}).matched,1);assert.equal(store.records({account:'某作者'}).matched,1);assert.equal(store.records({q:'不存在'}).jobs.length,0);
  const c=store.enqueue('https://example.com/article').job;store.update(c.id,{status:'completed',metadata:{site:'web',account:'网站',author:'独立作者'}});
  assert.equal(store.records({site:'web'}).matched,1);assert.equal(store.records({q:'独立作者'}).matched,1);
  for(const input of [{page:0},{page:10001},{pageSize:101},{status:'constructor'},{site:'__proto__'},{group:'toString'},{sort:'constructor'},{from:'2026-02-30'},{from:'2026-10-09',to:'2026-10-08'},{q:'a'.repeat(301)}])assert.throws(()=>store.records(input));
});

test('记录页在真实浏览器中筛选、翻页、跳转、清空及后退，首页只展示活跃条目', {timeout:120000},async t=>{
  const store=await fixture(t);
  for(let n=0;n<25;n++){const job=store.enqueue(`https://mp.weixin.qq.com/s/ui-fixture-${n}`).job;store.update(job.id,{title:`文章 ${n}`,status:n===0?'invalid':'completed',error:n===0?'作者已删除':null,metadata:{site:'wechat',account:'示例作者'}});}
  const pending=store.enqueue('https://mp.weixin.qq.com/s/ui-active').job;
  const publicFiles=new Set(['index.html','app.js','job-ui.js','records.html','records.js','style.css']),errors=[];
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1'),file=url.pathname==='/'?'index.html':url.pathname.slice(1);
      if(url.pathname==='/api/session')return res.end(JSON.stringify({token:'fixture'}));
      if(url.pathname==='/api/jobs')return res.end(JSON.stringify(store.records(Object.fromEntries(url.searchParams))));
      if(url.pathname==='/api/status')return res.end(JSON.stringify({version:'1.3.0.p',root:'fixture',jobs:store.active(),stats:store.stats(),busy:false,worker:{active:0,concurrency:2,pausedHosts:[]},feishu:{state:'disabled'},config:{archiveDir:'fixture',screenshotScale:3,concurrency:2,feishu:{hasSecret:false,appId:'',enabled:false,allowedSenders:[]}}}));
      if(publicFiles.has(file)){res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');return res.end(await readFile(new URL('../public/'+file,import.meta.url)));}
      res.statusCode=404;res.end();
    }catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`,browser=await launchBrowser();
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);await page.locator('#summary-total').getByText('26',{exact:true}).waitFor();assert.equal(await page.locator('#jobs .job').count(),1);assert.equal(await page.locator('#jobs .job').getAttribute('data-job-id'),pending.id);
    await page.getByRole('link',{name:'查看全部记录'}).click();await page.locator('#result-summary').getByText('匹配 26 条',{exact:false}).waitFor();
    const submit=async()=>{await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/jobs'),page.getByRole('button',{name:'筛选记录',exact:true}).click()]);await page.locator('#jobs[aria-busy=false]').waitFor();};
    await page.locator('[name=pageSize]').selectOption('20');await submit();assert.equal(await page.locator('#jobs .job').count(),20);
    await page.getByRole('button',{name:'下一页',exact:true}).click();await page.locator('#page-label').getByText('第 2 / 2 页',{exact:true}).waitFor();assert.equal(await page.locator('#jobs .job').count(),6);
    await page.locator('#jump-page').fill('1');await page.getByRole('button',{name:'前往',exact:true}).click();await page.locator('#page-label').getByText('第 1 / 2 页',{exact:true}).waitFor();
    await page.locator('[name=status]').selectOption('invalid');await submit();assert.equal(await page.locator('#jobs .job').count(),1);assert.equal(await page.locator('#jobs .error-text').textContent(),'作者已删除');
    await page.locator('[name=q]').fill('不存在');await submit();assert.equal(await page.locator('#jobs .job').count(),0);
    await page.getByRole('button',{name:'清空筛选',exact:true}).click();await page.locator('#result-summary').getByText('匹配 26 条',{exact:false}).waitFor();
    await page.goBack();await page.locator('#result-summary').getByText('匹配 0 条',{exact:false}).waitFor();assert.equal(await page.locator('[name=q]').inputValue(),'不存在');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);assert.deepEqual(errors,[]);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
