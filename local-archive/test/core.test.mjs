import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { articleUrl, articleKey, extractArticleUrls, resourceAllowed, safeName } from '../src/urls.mjs';
import { Store } from '../src/store.mjs';
import { parseFeishuMessage } from '../src/feishu.mjs';

const url = 'https://mp.weixin.qq.com/s/NfT-3GDq2sM2LNJlnXslYw';
test('文章链接校验、参数保留和提取', () => {
  assert.equal(articleUrl(url + '#read'), url);
  assert.equal(articleUrl('http://mp.weixin.qq.com/s?__biz=ABC&mid=123&idx=1&sn=foo&scene=1'), 'https://mp.weixin.qq.com/s?__biz=ABC&mid=123&idx=1&sn=foo&scene=1');
  assert.deepEqual(extractArticleUrls(`保存 [文章](${url})，重复 ${url}。`), [url]);
  for (const bad of ['http://127.0.0.1/a', 'https://mp.weixin.qq.com.evil.test/s/x', 'https://mp.weixin.qq.com:8443/s/x', 'file:///etc/passwd', 'https://mp.weixin.qq.com/cgi-bin/home']) assert.throws(() => articleUrl(bad));
  assert.equal(articleKey(url + '?scene=1'), articleKey(url + '?scene=2'));
  assert.equal(articleKey('https://mp.weixin.qq.com/s?__biz=A&mid=1&idx=1&sn=S&scene=1'), articleKey('https://mp.weixin.qq.com/s?sn=S&idx=1&mid=1&__biz=A&scene=2'));
  assert.ok(resourceAllowed('https://mmbiz.qpic.cn/a.jpg'));
  assert.ok(!resourceAllowed('http://127.0.0.1/a.jpg'));
  assert.ok(!resourceAllowed('https://qpic.cn.evil.test/a.jpg'));
  assert.equal(safeName('CON'), '_CON'); assert.equal(safeName('a/b:c?'), 'a_b_c_');
});

test('持久队列、消息与文章去重、事务和重启恢复', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'wx2md-test-'));
  const filename = path.join(temp, 'jobs.sqlite'); let store;
  try {
    store = new Store(filename);
    const first = store.enqueueMessage('msg1', [url], 'feishu');
    assert.equal(first.jobs.length, 1);
    assert.equal(store.enqueueMessage('msg1', [url], 'feishu').duplicate, true);
    assert.equal(store.enqueueMessage('msg2', [url], 'feishu').jobs[0].duplicate, true);
    assert.equal(store.list().length, 1);
    assert.throws(() => store.enqueueMessage('msg3', [url + '-new', 'https://evil.test/'], 'feishu'));
    assert.equal(store.list().length, 1);
    assert.equal(store.enqueueMessage('msg3', [url + '-new'], 'feishu').jobs.length, 1);
    const id = first.jobs[0].job.id;
    store.update(id, { status: 'processing', attempts: 1 }); store.close(); store = new Store(filename);
    assert.equal(store.get(id).status, 'pending');
    store.update(id, { status: 'failed' }); store.retry(id); assert.equal(store.get(id).status, 'pending');
  } finally {
    store?.close();
    const target = path.resolve(temp);
    if (target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('wx2md-test-')) rmSync(target, { recursive: true, force: true });
  }
});

test('飞书仅处理授权单聊，提取文本和富文本，忽略机器人/群聊', () => {
  const event = { sender: { sender_type: 'user', sender_id: { open_id: 'ou_me' } }, message: { message_id: 'om_1', chat_type: 'p2p', message_type: 'text', content: JSON.stringify({ text: '保存 ' + url }) } };
  assert.deepEqual(parseFeishuMessage(event, ['ou_me']).urls, [url]);
  assert.ok(parseFeishuMessage(event, ['ou_other']).ignored);
  assert.ok(parseFeishuMessage({ ...event, message: { ...event.message, chat_type: 'group' } }).ignored);
  assert.ok(parseFeishuMessage({ ...event, sender: { sender_type: 'app' } }).ignored);
  const post = { ...event, message: { ...event.message, message_type: 'post', content: JSON.stringify({ zh_cn: { content: [[{ tag: 'a', text: '原文', href: url }]] } }) } };
  assert.deepEqual(parseFeishuMessage(post).urls, [url]);
  assert.ok(parseFeishuMessage({ ...event, message: { ...event.message, message_type: 'image' } }).ignored);
});
