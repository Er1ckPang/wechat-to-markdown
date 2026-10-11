import * as lark from '@larksuiteoapi/node-sdk';
import { stat, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { terminalStates } from './receipt-store.mjs';

const quietLogger = {trace(){},debug(){},info(){},warn(){},error(){}};
const labels = {completed:'保存完成',partial:'已生成文件 · 有提示',invalid:'链接已失效',needs_manual:'需要人工确认',failed:'保存失败',unverified:'本地文件核验未通过'};
const text = (value, length=250) => Array.from(String(value || '').replace(/([?&](?:poc_token|access_token|token|secret)=)[^&\s]+/gi,'$1[隐藏]').replace(/[\x00-\x1f]/g,' ').replaceAll('<','＜').replaceAll('>','＞')).slice(0,length).join('');
export function receiptUrl(input) {
  try { const url=new URL(input);for(const key of [...url.searchParams.keys()])if(/token|secret|password|authorization/i.test(key))url.searchParams.delete(key);return text(url.href,600); }
  catch {return text(input,600);}
}
function filePath(directory, name) {
  if (typeof name !== 'string' || !name || path.isAbsolute(name)) throw new Error('归档文件名无效。');
  const target=path.resolve(directory,name),root=path.resolve(directory)+path.sep;
  if (!target.startsWith(root)) throw new Error('归档文件路径无效。');
  return target;
}
async function digest(filename) { const hash=createHash('sha256');for await(const chunk of createReadStream(filename))hash.update(chunk);return hash.digest('hex'); }

// The queue status alone is not proof of an intact archive (e.g. a reused file
// may have been moved/deleted). Check the published manifest and actual bytes.
export async function inspectReceiptJob(job) {
  const result={...job,resultStatus:job.status,reason:text(job.error),warnings:[],formats:[]};
  if (!['completed','partial'].includes(job.status)) return result;
  try {
    const names=job.metadata?.file_names;
    if (!job.output_dir || !names?.metadata) throw new Error('旧保存记录缺少可核验的文件清单，请在本机重新保存。');
    const manifestPath=filePath(job.output_dir,names.metadata),manifestStat=await stat(manifestPath);
    if (!manifestStat.isFile() || manifestStat.size>8*1024*1024) throw new Error('元信息文件无效。');
    const m=JSON.parse(await readFile(manifestPath,'utf8'));
    if (!['completed','partial'].includes(m.status) || m.status!==job.status) throw new Error('保存状态与归档元信息不一致。');
    for (const [key,label] of [['markdown','MD'],['html','内嵌 HTML'],['mobile','手机长图'],['desktop','电脑长图']]) {
      if (m.file_names?.[key]!==names[key]) throw new Error('归档文件清单不一致。');
      result.formats.push(label);
    }
    const required=[names.markdown,names.html,names.mobile,names.desktop,...(m.image_files || []).map(image=>image.path)];
    for (const name of required) {
      const filename=filePath(job.output_dir,name),info=await stat(filename),expected=m.files?.[name];
      if (!info.isFile() || !info.size || expected?.bytes!==info.size || !/^[a-f0-9]{64}$/.test(expected?.sha256 || '') || await digest(filename)!==expected.sha256) throw new Error('归档文件缺失、已改变或校验失败，请在本机重新保存。');
    }
    result.formats.push('metadata');
    const screenshots=m.screenshot_profiles;
    if (!screenshots?.mobile?.check.complete || !screenshots?.desktop?.check.complete) throw new Error('两种长图的完整性尚未确认。');
    if (!m.offline_check?.bodyPresent) throw new Error('离线 HTML 正文尚未确认。');
    result.warnings=(m.warnings || []).map(w=>text(w));
    if (m.offline_check.missingImages || m.offline_check.remoteImages || m.offline_check.remoteStylesheets || m.failed_images?.length || m.failed_resources?.length) {
      result.resultStatus='partial';
      if (!result.warnings.length) result.warnings.push('存在未保存的图片或页面资源，请查看本机 metadata。');
    }
    if (result.warnings.length) result.resultStatus='partial';
    result.imageCount=m.image_files?.length || 0;
  } catch(error) {result.resultStatus='unverified';result.reason=text(error.code==='ENOENT'?'本地文件已被移动或删除，请在本机重新保存。':error.message);result.formats=[];}
  return result;
}

export function buildReceiptParts(jobs, rejection='', maxBytes=12000, recordsUrl='http://127.0.0.1:17880/records.html') {
  if (rejection) return ['文章未入队\n'+text(rejection,700)];
  const counts=Object.fromEntries(Object.keys(labels).map(state=>[state,jobs.filter(job=>job.resultStatus===state).length]));
  const summary=Object.entries(counts).filter(([,n])=>n).map(([state,n])=>`${labels[state]} ${n} 篇`).join('；');
  const header=`文章保存结果：共 ${jobs.length} 篇\n${summary}\n核验时间：${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}\n文件保存在运行工具的电脑。\n本机记录：${recordsUrl}`;
  const blocks=jobs.map((job,index)=>{
    const lines=[`${index+1}. 【${labels[job.resultStatus] || '结果未确认'}】${text(job.title || job.metadata?.title || job.url,120)}`,`来源：${receiptUrl(job.url)}`];
    if (job.metadata?.migrations?.length) lines.push(`迁移后：${receiptUrl(job.metadata.resolved_url)}`);
    if (job.reused) lines.push('复用已有任务／归档，已核对本次实际结果。');
    if (job.formats?.length) lines.push(`输出：${job.formats.join('、')}；本地原图 ${job.imageCount} 张`,`目录：${text(job.output_dir,400)}`);
    if (job.reason) lines.push(`原因：${text(job.reason,500)}`);
    job.warnings?.slice(0,4).forEach(w=>lines.push('提示：'+text(w)));
    if (job.warnings?.length>4) lines.push(`另有 ${job.warnings.length-4} 条提示，请在本机查看。`);
    return lines.join('\n');
  });
  const sections=[];let current=[];
  for (const block of blocks) {
    if (Buffer.byteLength(header+'\n\n'+[...current,block].join('\n\n'),'utf8')>maxBytes-80 && current.length) {sections.push(current.join('\n\n'));current=[];}
    current.push(block);
  }
  if (current.length) sections.push(current.join('\n\n'));
  return sections.map((body,index)=>`${header}${sections.length>1?`\n第 ${index+1}/${sections.length} 部分`:''}\n\n${body}`);
}

export function createReceiptClient(config, request=options=>lark.defaultHttpInstance.request({...options,timeout:15000})) {
  return new lark.Client({appId:config.appId,appSecret:config.appSecret,domain:lark.Domain.Feishu,logger:quietLogger,
    httpInstance:{request,post:(url,data,options={})=>request({...options,url,data,method:'post'})}});
}
export class FeishuReceipts {
  constructor(store,getConfig,{clientFactory=createReceiptClient,now=Date.now,sendGap=350,recordsUrl='http://127.0.0.1:17880/records.html'}={}) {
    this.store=store;this.getConfig=getConfig;this.clientFactory=clientFactory;this.now=now;this.sendGap=sendGap;this.recordsUrl=recordsUrl;
    this.running=null;this.timer=null;this.stopped=false;this.lastSend=0;this.api=null;this.credentials=null;
  }
  status() {return {enabled:this.getConfig().feishu.replyResults!==false,...this.store.receipts.status(this.getConfig().feishu.appId || '')};}
  start() {this.stopped=false;clearInterval(this.timer);this.timer=setInterval(()=>this.kick(),1500);this.kick();}
  async stop() {this.stopped=true;clearInterval(this.timer);await this.running?.catch(()=>{});}
  retry() {this.store.receipts.retry(this.getConfig().feishu.appId || '');this.kick();}
  kick() {this.flush().catch(()=>{});}
  flush() {
    if (this.running) return this.running;
    this.running=this.run().finally(()=>{this.running=null;});return this.running;
  }
  async run() {
    const config=this.getConfig().feishu;
    if (this.stopped || !config.enabled || config.replyResults===false || !config.appId || !config.appSecret) return;
    for (const receipt of this.store.receipts.waiting(config.appId)) {
      const jobs=this.store.receipts.jobs(receipt.id);
      if (!receipt.rejection && (!jobs.length || jobs.some(job=>!terminalStates.has(job.status)))) continue;
      const checked=await Promise.all(jobs.map(inspectReceiptJob));
      this.store.receipts.freeze(receipt.id,jobs,buildReceiptParts(checked,receipt.rejection,12000,this.recordsUrl));
    }
    for (const candidate of this.store.receipts.due(config.appId,this.now())) {
      const current=this.getConfig().feishu;
      if (this.stopped || !current.enabled || current.replyResults===false || current.appId!==config.appId || current.appSecret!==config.appSecret) return;
      const receipt=this.store.receipts.claim(candidate.id);if(!receipt)continue;
      try {
        if (current.allowedSenders?.length && !current.allowedSenders.includes(receipt.sender_id)) throw new Error('回执发送人已不在允许名单中；已暂停发送。');
        if (!this.api || this.credentials?.appId!==config.appId || this.credentials?.appSecret!==config.appSecret) {this.api=this.clientFactory(config);this.credentials={appId:config.appId,appSecret:config.appSecret};}
        for (const part of this.store.receipts.parts(receipt.id)) {
          if (part.sent_message_id) continue;
          if (this.stopped) throw new Error('工具停止，回执将在重启后继续发送。');
          const delay=this.sendGap-(this.now()-this.lastSend);if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
          this.lastSend=this.now();
          const response=await this.api.im.message.reply({path:{message_id:receipt.reply_message_id},data:{msg_type:'text',content:JSON.stringify({text:part.text}),uuid:part.uuid}});
          if (response?.code!==0 || !response?.data?.message_id) {
            const error=new Error(response?.msg || '飞书未返回已发送的消息 ID。');error.apiCode=response?.code;throw error;
          }
          this.store.receipts.sentPart(receipt.id,part.position,response.data.message_id);
        }
        this.store.receipts.sent(receipt.id);
      } catch(error) {
        const code=error.apiCode ?? error.response?.data?.code;
        let reason=String(error.response?.data?.msg || error.message || '回执发送失败').replaceAll(config.appSecret,'[已隐藏]');
        if ([99991672,99991663,230027].includes(code) || /permission|scope|access denied/i.test(reason)) reason='飞书回执缺少权限：请开通 im:message:send_as_bot（以应用的身份发消息），发布应用新版本后重试回执。';
        const next=this.now()+Math.min(300000,5000*2**Math.min(receipt.attempts-1,6));
        this.store.receipts.failed(receipt.id,text(reason,500),next);
      }
    }
  }
}
