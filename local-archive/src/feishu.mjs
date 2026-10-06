import * as lark from '@larksuiteoapi/node-sdk';
import { extractArticleUrls } from './urls.mjs';

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
  return { messageId: 'feishu:' + message.message_id, senderId: openId, urls: extractArticleUrls(pieces.join('\n')) };
}

export class FeishuReceiver {
  constructor(store, kick, getConfig) {
    this.store = store; this.kick = kick; this.getConfig = getConfig;
    this.client = null; this.state = 'disabled'; this.error = ''; this.lastEvent = null;
  }
  status() {
    return { state: this.client?.getConnectionStatus()?.state || this.state, error: this.error, lastEvent: this.lastEvent };
  }
  stop() {
    if (this.client) this.client.close({ force: true });
    this.client = null; this.state = 'disabled'; this.error = '';
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
      'im.message.receive_v1': event => {
        const parsed = parseFeishuMessage(event, this.getConfig().feishu.allowedSenders);
        this.lastEvent = { at: new Date().toISOString(), senderId: parsed.senderId || '', result: parsed.ignored || (parsed.urls.length ? `收到 ${parsed.urls.length} 个文章链接` : '消息没有公众号链接') };
        if (parsed.ignored) return;
        // Commit to the durable queue before ACK; never wait for browser capture here.
        this.store.enqueueMessage(parsed.messageId, parsed.urls, 'feishu');
        this.kick();
      }
    });
    client.start({ eventDispatcher: dispatcher }).catch(error => {
      if (this.client === client) { this.error = redact(error); this.state = 'failed'; }
    });
  }
}
