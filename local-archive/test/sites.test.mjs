import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { articleUrl, articleSite, articleKey, extractArticleUrls, resourceAllowed } from '../src/urls.mjs';
import { createResourcePolicy, publicAddress } from '../src/network.mjs';
import { parseFeishuMessage } from '../src/feishu.mjs';
import { Store } from '../src/store.mjs';
import { archiveArticle, NeedsManualError } from '../src/archive.mjs';
import { launchBrowser } from '../src/browser.mjs';
import { inspectArticlePage, prepareArticlePage } from '../src/sites.mjs';

const urls = [
  'https://mp.weixin.qq.com/s/fixture',
  'https://zhuanlan.zhihu.com/p/123456',
  'https://www.zhihu.com/question/11/answer/456789',
  'https://blog.csdn.net/test_author/article/details/123456',
  'https://www.cnblogs.com/test_author/p/123456.html',
  'https://developer.mozilla.org/en-US/docs/Web/JavaScript'
];
test('多站点 URL、分享参数去重、回答边界与混合消息入队', async () => {
  assert.deepEqual(urls.map(u => articleSite(u).platform), ['wechat', 'zhihu', 'zhihu', 'csdn', 'cnblogs', 'web']);
  assert.equal(articleSite(urls[2]).kind, 'answer');
  assert.equal(articleUrl('http://m.blog.csdn.net/test_author/article/details/123456#comment'), urls[3]);
  assert.equal(articleKey(urls[1]), articleKey(urls[1] + '?utm_source=share&token=unrelated'));
  assert.equal(articleKey(urls[2]), articleKey('https://www.zhihu.com/answer/456789'));
  assert.equal(articleKey(urls[4]), articleKey('https://cnblogs.com/test_author/p/123456'));
  assert.equal(articleKey(urls[5]), articleKey(urls[5] + '?utm_source=share'));
  assert.notEqual(articleKey(urls[5] + '?page=1'), articleKey(urls[5] + '?page=2'));
  assert.notEqual(articleKey('https://www.example.com/s/a?page=1'), articleKey('https://www.example.com/s/a?page=2'));
  assert.deepEqual(extractArticleUrls(urls.map(u => `[原文](${u})`).join('；') + '\n重复 ' + urls[1] + '?utm_source=share。'), urls);
  for (const u of ['https://www.zhihu.com/question/11', 'https://zhuanlan.zhihu.com/', 'https://blog.csdn.net/test_author', 'https://www.cnblogs.com/test_author/', 'http://127.0.0.1/x', 'http://2130706433/x', 'http://[::1]/', 'https://article.local/', 'https://user:secret@example.com/a', 'https://www.example.com:8080/a']) assert.throws(() => articleUrl(u), u);
  const event = { sender: { sender_type: 'user', sender_id: { open_id: 'me' } }, message: { message_id: 'multi', chat_type: 'p2p', message_type: 'post', content: JSON.stringify({ zh_cn: { content: [urls.map(href => ({ tag: 'a', href, text: '保存' }))] } }) } };
  assert.deepEqual(parseFeishuMessage(event).urls, urls);
  const temp = await mkdtemp(path.join(os.tmpdir(), 'wx2md-message-sites-'));
  const store = new Store(path.join(temp, 'queue.sqlite'));
  try {
    const received = parseFeishuMessage(event);
    assert.equal(store.enqueueMessage(received.messageId, received.urls, 'feishu').jobs.length, urls.length);
    assert.equal(store.enqueueMessage(received.messageId, received.urls, 'feishu').duplicate, true);
    const repeated = store.enqueueMessage('simulation:new', urls.map(u => u + '?utm_source=share'), 'message-test');
    assert.equal(repeated.jobs.filter(j => j.duplicate).length, urls.length);
    assert.equal(store.list().length, urls.length);
    assert.ok(store.list().every(j => j.source === 'feishu' && j.status === 'pending'));
  } finally {
    store.close();
    if (path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('wx2md-message-sites-')) await rm(temp, { recursive: true, force: true });
  }
});

test('页面和资源的公网 DNS 校验拒绝私网解析、超出来源的测试地址', async () => {
  for (const a of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.16.1.1', '192.168.1.1', '100.64.1.1', '198.18.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) assert.equal(publicAddress(a), false, a);
  assert.equal(publicAddress('8.8.8.8'), true); assert.equal(publicAddress('2001:4860:4860::8888'), true);
  const calls = [];
  const policy = createResourcePolicy('web', { resolve: async host => { calls.push(host); return [{ address: host === 'private.example.com' ? '127.0.0.1' : '8.8.8.8' }]; } });
  assert.equal(await policy('https://cdn.example.com/image.png'), true);
  assert.equal(await policy('https://cdn.example.com/font.woff'), true);
  assert.equal(await policy('https://private.example.com/image.png'), false);
  assert.equal(await policy('http://127.0.0.1/image.png'), false);
  assert.equal(await policy('file:///etc/passwd'), false);
  assert.equal(await policy('data:image/png;base64,AA=='), true);
  assert.equal(calls.filter(h => h === 'cdn.example.com').length, 1);
  const mixed = createResourcePolicy('web', { resolve: async () => [{ address: '8.8.8.8' }, { address: '10.0.0.1' }] });
  assert.equal(await mixed('https://cdn.example.com/image.png'), false);
  const fixture = createResourcePolicy('web', { fixtureOrigin: 'http://127.0.0.1:12345' });
  assert.equal(await fixture('http://127.0.0.1:12345/test'), true);
  assert.equal(await fixture('http://127.0.0.1:12346/test'), false);
  assert.equal(resourceAllowed('https://pic1.zhimg.com/test.jpg', undefined, 'zhihu'), true);
  assert.equal(resourceAllowed('https://pic1.zhimg.com/test.jpg'), false); // WeChat keeps its original resource boundary.
});

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=', 'base64');
const body = `<h2>适配器测试</h2><p>这是一篇自行编写的测试文章，用于验证多个网站的正文识别与本地保存，包含<strong>加粗</strong>、<em>斜体</em>和本地原图。</p><table><thead><tr><th>名称</th><th>数值</th></tr></thead><tbody><tr><td>测试</td><td>42</td></tr></tbody></table><pre><code class="language-js">const answer = 42;\nconsole.log(answer);</code></pre><blockquote>保留引用</blockquote><img data-original="/pixel.png" src="/preview.png" alt="原图"><picture><source srcset="/preview.png"><img src="/pixel.png" alt="相同原图"></picture><p>公式：<span class="katex"><math><semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">x^2</annotation></semantics></math><span class="katex-html">重复渲染文本</span></span></p><p style="height:1200px;background:#e4eee5">正文末尾标记：只有选中的文章应保存。</p>`;
const wrappers = {
  csdn: `<h1 id="articleContentId">测试文章</h1><div class="article-info-box"><span class="follow-nickName">测试作者</span><time class="time">2026-10-08</time></div><div id="article_content"><div id="content_views">${body}<pre><code class="language-python"><table class="hljs-ln"><tr><td class="hljs-ln-numbers">1</td><td class="hljs-ln-code">print(42)</td></tr><tr><td class="hljs-ln-numbers">2</td><td class="hljs-ln-code">print(43)</td></tr></table></code></pre><button>复制代码</button><div class="article-copyright">网站版权工具条</div></div></div>`,
  cnblogs: `<h1><a id="cb_post_title_url">测试文章</a></h1><span id="Header1_HeaderTitle">测试作者</span><time id="post-date">2026-10-08</time><div id="cnblogs_post_body">${body}</div>`,
  'zhihu-post': `<h1 class="Post-Title">测试文章</h1><div class="Post-Header"><span class="AuthorInfo-name">测试作者</span></div><span class="ContentItem-time">2026-10-08</span><div class="Post-RichTextContainer">${body}<img ee="a+b" src="/pixel.png" alt="a+b"></div>`,
  'zhihu-answer': `<h1 class="QuestionHeader-title">测试文章</h1><div class="AnswerItem" data-answer-id="wrong"><div class="RichContent-inner"><div class="RichText"><p>其他回答禁止混入</p></div></div></div><div class="AnswerItem" data-zop='{"itemId": "456789"}'><span class="AuthorInfo-name">测试作者</span><div class="RichContent-inner"><div class="RichText">${body}</div></div></div>`,
  web: `<article><h1>测试文章</h1>${body}</article>`
};
const documentFor = key => `<!doctype html><html><head><meta charset="utf-8"><title>测试文章</title><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">{"@type":"BlogPosting","headline":"测试文章","author":{"name":"测试作者"},"datePublished":"2026-10-08"}</script>${key === 'csdn' ? '<script>String.prototype.replace=function(){throw Error("fixture prototype polluted")}</script>' : ''}</head><body><nav>导航广告禁止混入</nav>${wrappers[key]}<aside>推荐文章禁止混入</aside><footer>评论禁止混入</footer></body></html>`;

test('浏览器提取拒绝列表、空正文与验证页面，并保留已识别的正确容器', async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage(); const site = articleSite(urls[5]);
    await page.setContent('<title>文章列表</title><main><article><p>' + '链接列表'.repeat(40) + '</p><p>列表内容</p></article><article><p>' + '另一个列表'.repeat(40) + '</p><p>列表内容</p></article></main>');
    assert.equal((await page.evaluate(inspectArticlePage, site)).ready, false);
    await page.setContent('<title>Access Denied</title><article><p>' + '禁止访问'.repeat(40) + '</p><p>验证内容</p></article>');
    assert.equal((await page.evaluate(inspectArticlePage, site)).ready, false);
    await page.setContent('<title>登录 - 网站</title><main><form><input type="password"></form><p>' + '登录说明'.repeat(40) + '</p><p>请登录</p></main>');
    assert.equal((await page.evaluate(inspectArticlePage, site)).ready, false);
    await page.setContent('<base href="https://www.example.com/"><title>正文</title><article><p>短摘要</p></article>' + wrappers.web);
    const info = await page.evaluate(inspectArticlePage, site);
    assert.equal(info.ready, true); assert.equal(info.contentIndex, 1);
    await page.evaluate(prepareArticlePage, { site, info });
    assert.match(await page.locator('[data-wx2md-body]').innerText(), /正文末尾标记/);
    assert.equal(await page.getByText('短摘要', { exact: true }).count(), 0);
    await page.setContent('<main style="display:contents"><h1>现代正文容器</h1><p>' + '正文段落'.repeat(40) + '</p><p>正文结尾</p></main>');
    assert.equal((await page.evaluate(inspectArticlePage, site)).ready, true);
  } finally { await browser.close(); }
});

test('多站点完整归档：本地 MD 原图、纯正文内嵌 HTML、双无损长图与站点信息', { timeout: 300000 }, async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'wx2md-sites-'));
  const server = http.createServer((req, res) => {
    if (req.url === '/pixel.png' || req.url === '/preview.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(pixel); }
    if (req.url === '/styles.css') { res.writeHead(200, { 'Content-Type': 'text/css' }); return res.end('body{font-family:sans-serif}h2{color:#21684b}td,th{border:1px solid #456;padding:8px}pre{background:#eee;padding:12px}.RichText{font-size:17px}'); }
    if (req.url === '/blocked') { res.writeHead(403, { 'Content-Type': 'text/html' }); return res.end('<title>Access Denied</title><p>登录验证</p>'); }
    if (req.url === '/premium') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(documentFor('csdn').replace('</body>', '<div class="Paywall">登录付费后阅读</div></body>')); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(documentFor(req.url.slice(1)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const sites = { csdn: articleSite(urls[3]), cnblogs: articleSite(urls[4]), 'zhihu-post': articleSite(urls[1]), 'zhihu-answer': articleSite(urls[2]), web: articleSite(urls[5]) };
    for (const [key, site] of Object.entries(sites)) await t.test(key, async () => {
      const result = await archiveArticle({ id: randomUUID(), url: origin + '/' + key, source: 'fixture' }, { archiveDir: temp, screenshotScale: 1 }, () => {}, { fixtureOrigin: origin, site });
      const m = result.metadata, names = m.file_names;
      assert.equal(result.status, 'completed');
      assert.equal(m.site, site.platform); assert.equal(m.article_kind, site.kind); assert.equal(m.author, '测试作者');
      const md = await readFile(path.join(result.outputDir, names.markdown), 'utf8');
      const html = await readFile(path.join(result.outputDir, names.html), 'utf8');
      assert.match(md, new RegExp(`platform: "${site.platform}"`));
      assert.match(md, /```js\nconst answer = 42;/); assert.match(md, /\| 名称 \| 数值 \|/);
      assert.match(md, /!\[原图\]\(images\/001.png\)/); assert.match(md, /\$x\^2\$/);
      if (key === 'csdn') { assert.match(md, /```python\nprint\(42\)\nprint\(43\)/); assert.doesNotMatch(md, /网站版权工具条|复制代码/); }
      if (key === 'zhihu-post') assert.match(md, /\$a\+b\$/);
      assert.doesNotMatch(md, /重复渲染文本|其他回答禁止混入|导航广告禁止混入|推荐文章禁止混入|评论禁止混入/);
      assert.doesNotMatch(html, /其他回答禁止混入|导航广告禁止混入|推荐文章禁止混入|评论禁止混入/);
      assert.match(html, /data:image\/png;base64,/);
      assert.equal(m.offline_check.missingImages, 0); assert.equal(m.offline_check.remoteImages, 0);
      assert.deepEqual(await readFile(path.join(result.outputDir, 'images/001.png')), pixel);
      assert.deepEqual((await readdir(result.outputDir)).sort(), [...Object.values(names), 'images'].sort());
      for (const profile of Object.values(m.screenshot_profiles)) {
        assert.equal(profile.check.complete, true); assert.equal(profile.check.maxOverlapDifference, 0);
        const png = await readFile(path.join(result.outputDir, profile.file));
        assert.equal(png.readUInt32BE(20), profile.check.coveredRows); assert.ok(png.readUInt32BE(16) <= profile.viewport.width);
      }
    });
    await assert.rejects(archiveArticle({ id: randomUUID(), url: origin + '/blocked' }, { archiveDir: temp }, () => {}, { fixtureOrigin: origin, site: sites.csdn }), e => e instanceof NeedsManualError && /HTTP 403/.test(e.message));
    await assert.rejects(archiveArticle({ id: randomUUID(), url: origin + '/premium' }, { archiveDir: temp }, () => {}, { fixtureOrigin: origin, site: sites.csdn }), e => e instanceof NeedsManualError && /付费正文限制/.test(e.message));
    assert.equal((await readdir(path.join(temp, '.staging'))).length, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    const target = path.resolve(temp);
    if (target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('wx2md-sites-')) await rm(target, { recursive: true, force: true });
  }
});
