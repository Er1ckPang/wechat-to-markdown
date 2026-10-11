import * as lark from '@larksuiteoapi/node-sdk';
import { extractArticleUrls } from './urls.mjs';
import { MAX_BATCH_SIZE } from './limits.mjs';

export function parseFeishuMessage(event, allowedSenders = []) {
  const message = event?.message;
  const sender = event?.sender;
  if (!message || !message.message_id || message.chat_type !== 'p2p' || sender?.sender_type !== 'user') return { ignored: '仅接收用户发给机器人的单聊消息。' };
  const openId = sender.sender_id?.open_id || '';
  if (allowedSenders.length && !allowedSenders.includes(openId)) return { ignored: '发送人不在允许名单中。' };
  if (!['text', 'post'].includes(message.message_type)) return { ignored: '请发送纯文本文章链接，或含链接的富文本。' };
  let content;
  try { content = JSON.parse(message.content); } catch { return { ignored: '消息内容格式无效。' }; }
  const pieces = [];
  const walk = (value, depth = 0) => {
    if (!value || depth > 20) return;
    if (Array.isArray(value)) return value.forEach(item => walk(item, depth + 1));
    if (typeof value !== 'object') return;
    if (typeof value.text === 'string') pieces.push(value.text);
    if (typeof value.href === 'string') pieces.push(value.href);
    for (const [key, child] of Object.entries(value)) if (!['text', 'href'].includes(key)) walk(child, depth + 1);
  };
  walk(content);
  return { messageId: 'feishu:' + message.message_id, replyMessageId: message.message_id, senderId: openId, urls: extractArticleUrls(pieces.join('\n')) };
}

export class FeishuReceiver {
  constructor(store, kick, getConfig, { onQueued = () => {} } = {}) {
    this.store = store; this.kick = kick; this.getConfig = getConfig;
    this.onQueued = onQueued;
    this.client = null; this.state = 'disabled'; this.error = ''; this.lastEvent = null;
  }
  status() {
    return { state: this.client?.getConnectionStatus()?.state || this.state, error: this.error, lastEvent: this.lastEvent };
  }
  stop() {
    if (this.client) this.client.close({ force: true });
    this.client = null; this.state = 'disabled'; this.error = '';
  }
  receive(event) {
    const config=this.getConfig().feishu;
    const parsed=parseFeishuMessage(event,config.allowedSenders);
    this.lastEvent={at:new Date().toISOString(),senderId:parsed.senderId || '',result:parsed.ignored || (parsed.urls.length ? `收到 ${parsed.urls.length} 个文章链接` : '消息没有可保存的文章链接')};
    if (parsed.ignored) return;
    const receipt=config.replyResults!==false ? {appId:config.appId,replyMessageId:parsed.replyMessageId,senderId:parsed.senderId} : null;
    const rejection=parsed.urls.length>MAX_BATCH_SIZE ? `消息含 ${parsed.urls.length} 个不同链接，超过单次 ${MAX_BATCH_SIZE} 篇上限，未入队；请拆分发送。` : !parsed.urls.length ? '没有找到可保存的文章链接。请发送公众号、知乎专栏或具体回答、CSDN、博客园等单篇文章链接。' : '';
    try {
      // Only durable inserts happen before the event ACK. Capture and replies
      // run separately; duplicate deliveries cannot add another subscription.
      let result;
      if (rejection) {this.lastEvent.result=rejection;result=receipt ? this.store.receipts.reject(parsed.messageId,receipt,rejection) : {ignored:rejection};}
      else result=this.store.enqueueMessage(parsed.messageId,parsed.urls,'feishu',receipt);
      this.kick();this.onQueued();return result;
    } catch(error) {this.lastEvent.result='消息入队失败：'+String(error.message).replaceAll(config.appSecret,'[已隐藏]').slice(0,500);}
  }
  start() {
    this.stop();
    const config = this.getConfig().feishu;
    if (!config.enabled) return;
    if (!config.appId || !config.appSecret) { this.state = 'unconfigured'; this.error = '请填写 App ID 与 App Secret。'; return; }
    this.state = 'connecting';
    const redact = error => String(error?.message || error || '连接失败').replaceAll(config.appSecret, '[已隐藏]').slice(0, 500);
    // SDK logs are discarded so HTTP credential payloads never appear in logs.
    const logger = { trace() {}, debug() {}, info() {}, warn() {}, error() {} };
    const client = new lark.WSClient({
      appId: config.appId, appSecret: config.appSecret, domain: lark.Domain.Feishu,
      autoReconnect: true, logger, handshakeTimeoutMs: 15000, wsConfig: { pingTimeout: 30 },
      onReady: () => { this.state = 'connected'; this.error = ''; },
      onReconnected: () => { this.state = 'connected'; this.error = ''; },
      onReconnecting: () => { this.state = 'reconnecting'; },
      onError: error => { this.state = 'failed'; this.error = redact(error); }
    });
    this.client = client;
    const dispatcher = new lark.EventDispatcher({ logger }).register({
      'im.message.receive_v1': event => {if(this.client===client)this.receive(event);}
    });
    client.start({ eventDispatcher: dispatcher }).catch(error => {
      if (this.client === client) { this.error = redact(error); this.state = 'failed'; }
    });
  }
}
