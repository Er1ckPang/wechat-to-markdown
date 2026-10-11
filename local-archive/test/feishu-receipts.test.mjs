import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {FeishuReceiver} from '../src/feishu.mjs';
import {FeishuReceipts,inspectReceiptJob,buildReceiptParts,createReceiptClient,receiptUrl} from '../src/feishu-receipts.mjs';
import {Worker} from '../src/worker.mjs';
import {NeedsManualError,InvalidArticleError} from '../src/archive.mjs';
import {receiveImport} from '../src/browser-import.mjs';
import {pathToFileURL} from 'node:url';

const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=','base64');
const urls=['https://mp.weixin.qq.com/s/receipt-a','https://blog.csdn.net/fixture/article/details/123','https://zhuanlan.zhihu.com/p/123','https://www.cnblogs.com/fixture/p/123.html','https://example.com/article'];
const event=(id,links,sender='ou_fixture')=>({sender:{sender_type:'user',sender_id:{open_id:sender}},message:{message_id:id,chat_type:'p2p',message_type:'text',content:JSON.stringify({text:links.join('\n')})}});
async function until(check) {const end=Date.now()+90000;while(!check()){if(Date.now()>end)throw Error('等待测试结果超时');await new Promise(r=>setTimeout(r,10));}}
async function fixture(t) {
  const temp=await mkdtemp(path.join(os.tmpdir(),'wx2md-receipts-')),file=path.join(temp,'jobs.sqlite');
  const f={temp,file,store:new Store(file),senders:[],workers:[],config:{archiveDir:path.join(temp,'archives'),screenshotScale:1,concurrency:2,feishu:{enabled:true,replyResults:true,appId:'cli_fixture_'+randomUUID(),appSecret:'fixture-secret-not-real',allowedSenders:[]}}};
  t.after(async()=>{for(const w of f.workers)w.stop();for(const s of f.senders)await s.stop();f.store.close();assert.equal(path.dirname(temp),os.tmpdir());assert.ok(path.basename(temp).startsWith('wx2md-receipts-'));await rm(temp,{recursive:true,force:true});});
  return f;
}
function sender(f,send,options={}) {const s=new FeishuReceipts(f.store,()=>f.config,{sendGap:0,clientFactory:()=>({im:{message:{reply:send}}}),...options});f.senders.push(s);return s;}
function receiver(f) {return new FeishuReceiver(f.store,()=>{},()=>f.config);}
async function published(f,job,status='completed') {
  const outputDir=path.join(f.temp,'archives',job.id);await mkdir(path.join(outputDir,'images'),{recursive:true});
  const names={markdown:'测试文章.md',html:'测试文章.html',mobile:'测试文章_手机.png',desktop:'测试文章_电脑.png',metadata:'测试文章_metadata.json'};
  const files={},values={[names.markdown]:Buffer.from('# 测试文章\n![测试](images/001.png)'),[names.html]:Buffer.from('<article><h1>测试文章</h1></article>'),[names.mobile]:pixel,[names.desktop]:pixel,'images/001.png':pixel};
  for(const [name,bytes] of Object.entries(values)){await writeFile(path.join(outputDir,name),bytes);files[name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
  const metadata={status,title:'测试文章',original_url:job.url,file_names:names,files,image_files:[{path:'images/001.png'}],warnings:status==='partial'?['1 张正文图片未能保存。']:[],offline_check:{bodyPresent:true,missingImages:status==='partial'?1:0,remoteImages:0,remoteStylesheets:0},screenshot_profiles:{mobile:{check:{complete:true,coveredRows:1,pixelHeight:1}},desktop:{check:{complete:true,coveredRows:1,pixelHeight:1}}}};
  await writeFile(path.join(outputDir,names.metadata),JSON.stringify(metadata));
  return {status,title:'测试文章',outputDir,metadata};
}
function finish(store,job,result){store.update(job.id,{status:result.status,title:result.title,output_dir:result.outputDir,metadata:result.metadata});}

test('每条授权单聊绑定原消息，共享已有任务仍分别回执；事件重投不重复',{timeout:20000},async t=>{
  const f=await fixture(t),r=receiver(f);const old=f.store.enqueue(urls[0]).job;
  const a=r.receive(event('om_a',[...urls.slice(0,3)])),b=r.receive(event('om_b',[urls[0]],'ou_second'));
  assert.equal(a.jobs[0].duplicate,true);assert.equal(b.jobs[0].job.id,old.id);assert.equal(r.receive(event('om_a',urls)).duplicate,true);
  assert.equal(f.store.list().length,3);const calls=[],s=sender(f,async req=>{calls.push(req);return {code:0,data:{message_id:'reply_'+calls.length}};});
  await s.flush();assert.equal(calls.length,0);
  for(const job of f.store.list())finish(f.store,job,await published(f,job));
  await s.flush();assert.equal(calls.length,2);assert.deepEqual(calls.map(c=>c.path.message_id),['om_a','om_b']);
  assert.match(JSON.parse(calls[0].data.content).text,/共 3 篇/);assert.match(JSON.parse(calls[1].data.content).text,/复用已有/);
  assert.equal(s.status().sent,2);assert.equal(s.status().lastError,'');await s.flush();assert.equal(calls.length,2);
  r.receive({...event('om_bot',urls),sender:{sender_type:'app'}});r.receive({...event('om_group',urls),message:{...event('om_group',urls).message,chat_type:'group'}});
  f.config.feishu.allowedSenders=['ou_fixture'];r.receive(event('om_denied',urls,'ou_other'));
  assert.equal(s.status().sent,2);assert.equal(s.status().waiting,0);
});

test('后台完成后汇总成功、部分保存、失效、人工确认和失败，发送失败不改保存结果',{timeout:20000},async t=>{
  const f=await fixture(t),r=receiver(f),calls=[],s=sender(f,async req=>{calls.push(req);return {code:0,data:{message_id:'reply'}};});
  r.receive(event('om_results',urls));let settled=0;
  const w=new Worker(f.store,()=>f.config,{startGap:0,logFailure:async()=>{},onSettled:()=>{settled++;},archive:async job=>{
    const index=urls.indexOf(job.url);
    if(index===2)throw new InvalidArticleError('作者已删除文章');
    if(index===3)throw new NeedsManualError('需要正常登录或验证');
    if(index===4)throw new Error('截图接缝核验失败');
    return published(f,job,index===1?'partial':'completed');
  }});f.workers.push(w);w.run();await s.flush();assert.equal(calls.length,0);
  await until(()=>!w.busy&&!f.store.pending().length);await s.flush();assert.equal(settled,5);assert.equal(calls.length,1);
  const message=JSON.parse(calls[0].data.content).text;
  for(const label of ['保存完成 1 篇','有提示 1 篇','链接已失效 1 篇','需要人工确认 1 篇','保存失败 1 篇','输出：MD','截图接缝核验失败'])assert.ok(message.includes(label),label);
  assert.match(message,/1 张正文图片未能保存/);assert.equal(s.status().sent,1);
});

test('权限失败显示可操作原因，服务重启后用相同 UUID 和内容补发，不重抓文章',async t=>{
  const f=await fixture(t),r=receiver(f),calls=[];let time=10000;
  const {jobs}=r.receive(event('om_retry',[urls[0]]));finish(f.store,jobs[0].job,await published(f,jobs[0].job));
  const first=sender(f,async req=>{calls.push(req);return {code:230027,msg:'missing permission '+f.config.feishu.appSecret};},{now:()=>time});
  await first.flush();assert.equal(first.status().pending,1);assert.match(first.status().lastError,/im:message:send_as_bot/);assert.ok(!first.status().lastError.includes(f.config.feishu.appSecret));
  assert.equal(f.store.get(jobs[0].job.id).status,'completed');await first.flush();assert.equal(calls.length,1);
  await first.stop();f.store.close();f.store=new Store(f.file);time+=5000;
  const next=sender(f,async req=>{calls.push(req);return {code:0,data:{message_id:'reply_ok'}};},{now:()=>time});await next.flush();
  assert.equal(next.status().sent,1);assert.equal(calls[0].data.uuid,calls[1].data.uuid);assert.equal(calls[0].data.content,calls[1].data.content);assert.equal(f.store.get(jobs[0].job.id).attempts,0);
});

test('100篇结果完整分段且受字节限制，部分已送达后重启只补剩余段',async t=>{
  const f=await fixture(t),r=receiver(f),links=Array.from({length:100},(_,i)=>`https://mp.weixin.qq.com/s/receipts-${i}`),calls=[];let time=10000;
  const added=r.receive(event('om_100',links));added.jobs.forEach(({job},i)=>f.store.update(job.id,{status:'failed',title:'测试第'+i+'篇',error:'原文访问失败。'.repeat(40)}));
  const s=sender(f,async req=>{calls.push(req);if(calls.length===2)throw Error('ETIMEDOUT');return {code:0,data:{message_id:'reply_1'}};},{now:()=>time});await s.flush();
  const parts=f.store.receipts.parts(added.receiptId);assert.ok(parts.length>1);assert.ok(parts.every(p=>Buffer.byteLength(p.text)<=12000));assert.equal(parts.filter(p=>p.sent_message_id).length,1);
  const combined=parts.map(p=>p.text).join('\n');links.forEach(link=>assert.ok(combined.includes(link)));
  await s.stop();f.store.close();f.store=new Store(f.file);time+=5000;
  const resumed=sender(f,async req=>{calls.push(req);return {code:0,data:{message_id:'reply_'+calls.length}};},{now:()=>time});await resumed.flush();
  assert.equal(resumed.status().sent,1);assert.equal(calls[1].data.uuid,calls[2].data.uuid);assert.equal(calls.filter(req=>req.data.uuid===parts[0].uuid).length,1);
});

test('回执核验实际字节，捕捉同大小篡改、文件删除、缺图和不完整长图',async t=>{
  const f=await fixture(t),job=f.store.enqueue(urls[0]).job,result=await published(f,job);finish(f.store,job,result);
  assert.equal((await inspectReceiptJob(f.store.get(job.id))).resultStatus,'completed');
  const filename=path.join(result.outputDir,result.metadata.file_names.markdown),original=await readFile(filename),altered=Buffer.from(original);altered[0]=33;await writeFile(filename,altered);
  assert.equal((await inspectReceiptJob(f.store.get(job.id))).resultStatus,'unverified');await writeFile(filename,original);
  await rm(path.join(result.outputDir,'images/001.png'));assert.match((await inspectReceiptJob(f.store.get(job.id))).reason,/移动或删除/);await writeFile(path.join(result.outputDir,'images/001.png'),pixel);
  const meta=path.join(result.outputDir,result.metadata.file_names.metadata);result.metadata.offline_check.missingImages=1;await writeFile(meta,JSON.stringify(result.metadata));assert.equal((await inspectReceiptJob(f.store.get(job.id))).resultStatus,'partial');
  result.metadata.screenshot_profiles.mobile.check.complete=false;await writeFile(meta,JSON.stringify(result.metadata));assert.equal((await inspectReceiptJob(f.store.get(job.id))).resultStatus,'unverified');
  assert.ok(!receiptUrl('https://mp.weixin.qq.com/s?a=1&poc_token=private&access_token=private').includes('private'));
});

test('回执事务失败回滚；开关、应用身份和允许名单限制发送，历史消息不补建回执',async t=>{
  const f=await fixture(t),r=receiver(f),calls=[],s=sender(f,async req=>{calls.push(req);return {code:0,data:{message_id:'reply'}};});
  f.store.enqueueMessage('feishu:om_legacy',[urls[0]],'feishu');assert.equal(s.status().waiting,0);
  assert.throws(()=>f.store.enqueueMessage('feishu:om_bad',[urls[1]],'feishu',{appId:'',replyMessageId:'om_bad'}),/来源信息/);assert.equal(f.store.list().length,1);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM received_messages WHERE id=?').get('feishu:om_bad').n,0);
  const added=r.receive(event('om_scope',[urls[0]]));finish(f.store,added.jobs[0].job,await published(f,added.jobs[0].job));
  f.config.feishu.replyResults=false;await s.flush();assert.equal(calls.length,0);r.receive(event('om_silent',[urls[2]]));assert.equal(f.store.receipts.jobs(added.receiptId).length,1);
  f.config.feishu.replyResults=true;const appId=f.config.feishu.appId;f.config.feishu.appId='cli_other';await s.flush();assert.equal(calls.length,0);f.config.feishu.appId=appId;
  f.config.feishu.allowedSenders=['ou_other'];await s.flush();assert.equal(calls.length,0);assert.match(s.status().lastError,/允许名单/);
  f.config.feishu.allowedSenders=[];s.retry();await s.flush();assert.equal(calls.length,1);assert.equal(calls[0].path.message_id,'om_scope');
});

test('空链接与超额消息明确拒绝且不抓取；并发 flush 不重复，停止后恢复中断发送',async t=>{
  const f=await fixture(t),r=receiver(f);r.receive(event('om_empty',[]));r.receive(event('om_large',Array.from({length:101},(_,i)=>`https://mp.weixin.qq.com/s/overflow-${i}`)));
  assert.equal(f.store.list().length,0);const calls=[];let release;
  const s=sender(f,async req=>{calls.push(req);await new Promise(resolve=>release=resolve);return {code:0,data:{message_id:'reply_'+calls.length}};});
  const pending=s.flush(),same=s.flush();assert.equal(pending,same);await until(()=>calls.length===1);assert.match(JSON.parse(calls[0].data.content).text,/没有找到/);
  const stopping=s.stop();release();await pending;await stopping;assert.equal(calls.length,1);
  const unsent=f.store.receipts.due(f.config.feishu.appId,Date.now()+10000)[0];assert.ok(unsent);const before=f.store.receipts.parts(unsent.id)[0];f.store.receipts.claim(unsent.id);
  f.store.close();f.store=new Store(f.file);
  const resumed=sender(f,async req=>{calls.push(req);return {code:0,data:{message_id:'reply_final'}};});await resumed.flush();
  assert.match(JSON.parse(calls[1].data.content).text,/超过单次 100/);assert.equal(calls[1].data.uuid,before.uuid);assert.equal(resumed.status().sent,2);
});

test('重试中的任务不发布旧快照，前20条未完成消息不会阻塞后续已完成回执',async t=>{
  const f=await fixture(t),r=receiver(f),calls=[];
  for(let i=0;i<20;i++)r.receive(event('om_wait_'+i,[`https://mp.weixin.qq.com/s/wait-${i}`]));
  const last=r.receive(event('om_ready',[urls[0]])),job=last.jobs[0].job;f.store.update(job.id,{status:'failed',error:'测试访问失败'});
  const snapshot=f.store.get(job.id);f.store.retry(job.id);
  assert.equal(f.store.receipts.freeze(last.receiptId,[snapshot],['旧结果']),false);
  f.store.update(job.id,{status:'failed',error:'测试访问失败'});
  const s=sender(f,async req=>{calls.push(req);return {code:0,data:{message_id:'ready_reply'}};});await s.flush();
  assert.equal(calls.length,1);assert.equal(calls[0].path.message_id,'om_ready');assert.equal(s.status().waiting,20);
});

test('官方 SDK 使用应用令牌回复原消息，正文和 UUID 按真实 API 契约发送',async()=>{
  const requests=[],config={appId:'cli_transport_'+randomUUID(),appSecret:'test-only-secret'};
  const client=createReceiptClient(config,async options=>{
    requests.push(options);
    if(options.url.includes('/auth/'))return {code:0,expire:7200,app_access_token:'fixture_app_token',tenant_access_token:'fixture_tenant_token'};
    assert.match(options.url,/\/im\/v1\/messages\/om_contract\/reply$/);assert.equal(options.method.toLowerCase(),'post');assert.equal(options.data.uuid,'fixture-dedupe');assert.equal(JSON.parse(options.data.content).text,'实际保存结果');
    return {code:0,data:{message_id:'om_reply'}};
  });
  const response=await client.im.message.reply({path:{message_id:'om_contract'},data:{msg_type:'text',content:JSON.stringify({text:'实际保存结果'}),uuid:'fixture-dedupe'}});
  assert.equal(response.data.message_id,'om_reply');assert.ok(requests.some(req=>req.url.includes('/auth/')));assert.ok(requests.at(-1).headers.Authorization.includes('fixture_tenant_token'));
});

test('真实浏览器导入到后台归档再回执：全部文件发布后才回复，原图与双长图可核验',{timeout:120000},async t=>{
  const f=await fixture(t),r=receiver(f),source=urls[0],calls=[];
  const saved=`<!doctype html><html><head><meta charset="utf-8"><link rel="canonical" href="${source}"><style>.rich_media_area_primary_inner{max-width:680px;margin:20px auto}p{line-height:1.8}</style></head><body><main class="rich_media_area_primary_inner"><h1 id="activity-name">回执真实浏览器测试</h1><span id="js_name">自主测试公众号</span><div id="js_content"><p>自主编写的测试正文，检验后台已经真正发布归档文件后才返回结果。</p><img src="data:image/png;base64,${pixel.toString('base64')}"><p>文章的完整结尾。</p></div></main></body></html>`;
  const directory=pathToFileURL(f.temp+path.sep),descriptor=await receiveImport([Buffer.from(saved)],'fixture.html',directory);
  const added=r.receive(event('om_actual',[source]));f.store.update(added.jobs[0].job.id,{metadata:{browser_import:descriptor}});
  const s=sender(f,async req=>{const job=f.store.get(added.jobs[0].job.id);assert.equal(job.status,'completed');assert.equal((await inspectReceiptJob(job)).resultStatus,'completed');calls.push(req);return {code:0,data:{message_id:'om_actual_reply'}};});
  const {archiveArticle}=await import('../src/archive.mjs');
  const w=new Worker(f.store,()=>f.config,{startGap:0,logFailure:async()=>{},onSettled:()=>s.kick(),archive:(job,config,stage,options)=>archiveArticle(job,config,stage,{...options,importDirectory:directory})});f.workers.push(w);w.run();
  assert.equal(calls.length,0);await until(()=>s.status().sent===1);const message=JSON.parse(calls[0].data.content).text;
  assert.equal(calls[0].path.message_id,'om_actual');assert.match(message,/保存完成 1 篇/);assert.match(message,/本地原图 1 张/);assert.match(message,/手机长图、电脑长图/);
});
