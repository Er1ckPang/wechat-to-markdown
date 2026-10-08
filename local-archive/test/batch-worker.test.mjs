import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Store } from '../src/store.mjs';
import { Worker } from '../src/worker.mjs';
import { InvalidArticleError, NeedsManualError } from '../src/link-state.mjs';
import { concurrency, CaptureSlot } from '../src/limits.mjs';
import { extractArticleUrls } from '../src/urls.mjs';
import { friendlyError } from '../src/diagnostics.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) { for (let i=0;i<500;i++) { if(check())return;await wait(5); } throw Error('等待测试条件超时'); }
async function queue(t) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'wx2md-worker-'));const store=new Store(path.join(dir,'jobs.sqlite'));
  store.cleanupWorkers=[];
  // Stop every scheduler before closing SQLite, including queued immediates.
  t.after(async()=>{store.cleanupWorkers.forEach(worker=>worker.stop());store.close();if(path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('wx2md-worker-'))await rm(dir,{recursive:true,force:true});});return store;
}
const result={status:'completed',title:'测试',outputDir:null,metadata:{link_state:'available'}};

test('单篇微信验证重试开启采集浏览器，保留迁移信息，不改全局设置或影响其他任务',async t=>{
  const store=await queue(t),config={concurrency:2,showBrowser:false},seen=[];
  const verified=store.enqueue('https://mp.weixin.qq.com/s/verification').job;
  store.update(verified.id,{status:'needs_manual',metadata:{requires_verification:true,link_state:'migrated',resolved_url:'https://mp.weixin.qq.com/s/new',migrations:[{from:verified.url,to:'https://mp.weixin.qq.com/s/new'}]}});
  const retry=store.retry(verified.id,{verification:true});assert.equal(retry.metadata.migrations.length,1);assert.equal(retry.metadata.verification_requested,true);
  const ordinary=store.enqueue('https://example.com/normal').job;assert.throws(()=>store.retry(ordinary.id,{verification:true}));
  const worker=new Worker(store,()=>config,{startGap:0,archive:async(job,settings)=>{seen.push({id:job.id,showBrowser:settings.showBrowser});return result;}});store.cleanupWorkers.push(worker);worker.start();
  await until(()=>seen.length===2&&!worker.busy);assert.equal(seen.find(job=>job.id===verified.id).showBrowser,true);assert.equal(seen.find(job=>job.id===ordinary.id).showBrowser,false);assert.equal(config.showBrowser,false);
  store.update(verified.id,{status:'needs_manual',metadata:{requires_verification:true,verification_requested:true}});assert.equal(store.retry(verified.id).metadata.verification_requested,undefined);worker.stop();
});

test('100篇持久批次：重复链接去重，101篇完全拒绝，入队失败回滚，消息入口同上限',async t=>{
  const store=await queue(t);const urls=Array.from({length:100},(_,i)=>`https://mp.weixin.qq.com/s/batch-${i}`);
  assert.equal(extractArticleUrls([...urls,urls[0]].join('\n')).length,100);
  assert.equal(store.enqueueBatch(urls).length,100);assert.equal(store.pending().length,100);
  assert.ok(store.enqueueBatch(urls).every(j=>j.duplicate));
  assert.throws(()=>store.enqueueBatch([...urls,'https://mp.weixin.qq.com/s/101']),/最多提交 100/);
  assert.throws(()=>store.enqueueMessage('too-many',[...urls,urls[0]],'feishu'),/最多提交 100/);
  assert.throws(()=>store.enqueueBatch(['https://mp.weixin.qq.com/s/new','http://localhost/no']),/公网|链接|地址/);
  assert.equal(store.list().length,100);assert.equal(store.enqueueMessage('valid',urls,'feishu').jobs.length,100);
  assert.equal(store.enqueueMessage('valid',urls,'feishu').duplicate,true);
  assert.deepEqual(store.stats(),{pending:100});
});

test('并发队列100篇恰好处理一次、同站最多2篇、长图互斥；失败隔离与动态降低并发',async t=>{
  const store=await queue(t);let config={concurrency:4};let active=0,max=0,captures=0,maxCaptures=0;const hosts=new Map(),seen=new Set();
  store.enqueueBatch(Array.from({length:100},(_,i)=>`https://host${i%4}.example.com/article/${i}`));
  const worker=new Worker(store,()=>config,{startGap:1,archive:async(job,settings,onStage,options)=>{
    assert.ok(!seen.has(job.id));seen.add(job.id);const host=new URL(job.url).hostname;hosts.set(host,(hosts.get(host)||0)+1);assert.ok(hosts.get(host)<=2);
    active++;max=Math.max(max,active);onStage('测试并发');await wait(10);
    try{await options.withCaptureSlot(async()=>{captures++;maxCaptures=Math.max(maxCaptures,captures);await wait(2);captures--;});
      if(job.url.endsWith('/0'))throw new InvalidArticleError('文章已删除',{reason:'deleted'});
      if(job.url.endsWith('/1'))throw new NeedsManualError('验证');return result;
    }finally{active--;hosts.set(host,hosts.get(host)-1);}
  }});
  store.cleanupWorkers.push(worker);worker.start();worker.kick();worker.run();
  await until(()=>seen.size===100&&!worker.busy);assert.equal(max,4);assert.equal(maxCaptures,1);
  assert.deepEqual(store.stats(),{completed:98,invalid:1,needs_manual:1});assert.ok(store.list().every(j=>j.attempts===1));
  const invalid=store.list().find(j=>j.status==='invalid');assert.equal(invalid.metadata.link_state,'invalid');
  store.retry(invalid.id);assert.equal(store.get(invalid.id).metadata,null);worker.stop();
  // A lower setting drains already-running work and applies to subsequent starts.
  const second=new Worker(store,()=>config,{startGap:0,archive:async()=>{await wait(20);return result;}});store.cleanupWorkers.push(second);
  store.enqueueBatch(Array.from({length:6},(_,i)=>`https://other${i}.example.com/a`));second.run();assert.equal(second.status().active,4);
  config={concurrency:1};await until(()=>second.status().active===1);assert.equal(second.status().concurrency,1);
  await until(()=>!second.busy&&store.pending().length===0);
});

test('限流只暂停同站新任务，其他网站继续保存；停止不领新任务',async t=>{
  const store=await queue(t);let time=Date.now();const calls=[];store.enqueueBatch(['https://mp.weixin.qq.com/s/a','https://mp.weixin.qq.com/s/b','https://example.com/article']);
  const worker=new Worker(store,()=>({concurrency:2}),{now:()=>time,startGap:1,archive:async job=>{
    calls.push(job.url);if(job.url.endsWith('/a')){const error=new NeedsManualError('限流');error.retryAfterMs=60000;throw error;}return result;
  }});store.cleanupWorkers.push(worker);worker.run();await until(()=>!worker.busy);
  assert.equal(store.stats().pending,1);assert.ok(calls.includes('https://example.com/article'));assert.equal(worker.status().pausedHosts.length,1);
  time+=60001;worker.run();await until(()=>!worker.busy);assert.equal(store.pending().length,0);
  worker.stop();store.enqueueBatch(['https://mp.weixin.qq.com/s/c']);worker.run();assert.equal(store.pending().length,1);
});

test('并发参数拒绝非法值；长图锁异常时释放资源',async()=>{
  for(const value of [0,5,1.5,NaN,'bad'])assert.throws(()=>concurrency(value));assert.equal(concurrency(),2);
  const slot=new CaptureSlot();await assert.rejects(slot.run(async()=>{throw Error('捕获失败');}));assert.equal(slot.active,0);
  assert.equal(await slot.run(async()=>42),42);assert.equal(slot.active,0);
  assert.equal(friendlyError(new Error('page.evaluate: Error: 正文超宽\n    at eval')), '正文超宽');
});
