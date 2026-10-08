import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, rm, readdir, mkdir, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { archiveArticle } from '../src/archive.mjs';
import { launchBrowser } from '../src/browser.mjs';
import { pathToFileURL } from 'node:url';
import { sanitizeMarkdownHtml, renderMarkdown } from '../src/markdown.mjs';

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=', 'base64');
const article = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/article.css"><title>归档测试文章</title></head><body><main class="article"><h1 id="activity-name">归档测试文章</h1><span id="js_name">测试公众号</span><time id="publish_time">2026-10-06</time><div id="js_content"><h2>保留标题</h2><p style="color:rgb(20,100,60)">这是<strong>粗体</strong>与<em>斜体</em>，还有<span style="font-weight:700">样式粗体</span>与 x<sup>2</sup>、H<sub>2</sub>O。</p><p style="font-size:24px;font-weight:700">视觉标题</p><blockquote>引用内容</blockquote><ul><li>列表一</li><li>列表二</li></ul><table><thead><tr><th><section>项目</section></th><th>值</th></tr></thead><tbody><tr><td>图片</td><td><section>本地</section><section>原图</section></td></tr></tbody></table><table><tr><th colspan="2">合并表头</th></tr><tr><td>A</td><td>B</td></tr></table><section data-formula="y = x^2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" style="width:2em;height:2em"><path d="M0 0L20 20"/></svg></section><p>行内公式 <span data-formula="4.2 &#92;times 10^{10}"><span data-formula="4.2 &#92;times 10^{10}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" style="width:2em;height:2em"><path d="M0 0L20 20"/></svg></span></span> 种。</p><p>MathML <math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mi>x</mi><mn>2</mn></msup></math>。</p><pre><code>const answer = 42;</code></pre><section style="height:1400px;background:#edf3ee">下面是延迟加载图片</section><img data-src="/pixel.png" alt="延迟图片" style="width:100px;height:80px"><img data-src="/pixel.png" alt="重复图片"></div></main></body></html>`;

test('真实浏览器归档：五个标题命名文件加images目录，MD本地引用、HTML内嵌原图，手机电脑单张长图', { timeout: 300000 }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'wx2md-archive-test-'));
  const server = http.createServer((req, res) => {
    if (req.url === '/pixel.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(pixel); }
    else if (req.url === '/article.css') { res.writeHead(200, { 'Content-Type': 'text/css' }); res.end('body{margin:0;background:#f5f5ef}.article{margin:20px;padding:20px;border:3px solid #205e42}h2{color:#205e42}table{border-collapse:collapse}td,th{border:1px solid #234;padding:12px}'); }
    else if (req.url === '/fake.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end('<html>not an image</html>'); }
    else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(req.url === '/s/broken' ? article.replace('</div></main>', '<img data-src="/fake.png" alt="失败图片"></div></main>') : req.url === '/s/tall' ? article.replace('height:1400px', 'height:35000px') : article); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await archiveArticle({ id: randomUUID(), url: origin + '/s/test', source: 'fixture' }, { archiveDir: temp, width: 430 }, () => {}, { fixtureOrigin: origin });
    const names = result.metadata.file_names;
    assert.deepEqual((await readdir(result.outputDir)).sort(), [...Object.values(names),'images'].sort());
    assert.ok(Object.values(names).every(name => name.startsWith('归档测试文章')));
    const md = await readFile(path.join(result.outputDir, names.markdown), 'utf8');
    const html = await readFile(path.join(result.outputDir, names.html), 'utf8');
    const png = await readFile(path.join(result.outputDir, names.mobile));
    assert.match(md, /## 保留标题/); assert.match(md, /\*\*粗体\*\*/); assert.match(md, /\| 项目 \| 值 \|/); assert.match(md, /```/);
    assert.ok(!md.includes('data:image/')); assert.equal(result.metadata.markdown_images.count, 1);
    assert.equal(result.metadata.markdown_images.mode,'local-originals');
    assert.match(md, /!\[延迟图片\]\(images\/001.png\)/);
    assert.match(md, /!\[重复图片\]\(images\/001.png\)/);
    assert.match(html, /data:image\/png;base64,/); assert.match(html, /#205e42/);
    assert.match(html, /href="#wx2md-original-001"/); assert.equal(result.metadata.html_images.linked, 2);
    assert.deepEqual(await readFile(path.join(result.outputDir,'images/001.png')),pixel);
    assert.deepEqual(await readdir(path.join(result.outputDir,'images')),['001.png']);
    assert.equal(result.metadata.image_files[0].path,'images/001.png');
    assert.ok(!/<img[^>]+\ssrc="https?:/.test(html));
    assert.equal(png.subarray(1,4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1296);
    assert.equal(png.readUInt32BE(20), result.metadata.files[names.mobile].height);
    assert.equal(result.metadata.screenshot_scale, 3);
    for (const profile of Object.values(result.metadata.screenshot_profiles)) {
      assert.equal(profile.check.complete,true);
      assert.equal(profile.check.maxOverlapDifference,0);
      assert.equal(profile.check.coveredRows,result.metadata.files[profile.file].height);
    }
    assert.match(md, /\*\*样式粗体\*\*/); assert.match(md, /## 视觉标题/);
    assert.match(md, /<sup>2<\/sup>/); assert.match(md, /<sub>2<\/sub>/);
    assert.match(md, /\$\$\ny = x\^2\n\$\$/); assert.match(md, /\$4.2 \\times 10\^\{10\}\$/);
    assert.match(md, /colspan="2"/); assert.match(md, /<math/);
    assert.equal(result.metadata.markdown_structure.formulas, 3);
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
      await page.goto(pathToFileURL(path.join(result.outputDir, names.html)).href);
      await page.locator('#js_content img').first().click();
      await page.locator('#wx2md-original-001').waitFor({state:'visible'});
      assert.equal(await page.locator('#wx2md-original-001>img').evaluate(e=>e.naturalWidth),1);
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#wx2md-original-001 a[download]').click();
      const download = await downloadPromise;
      assert.equal(await download.failure(),null);
      await page.setContent('<article></article>');
      const rendered = await page.evaluate(sanitizeMarkdownHtml,renderMarkdown(md));
      await page.locator('article').evaluate((e,html)=>e.innerHTML=html,rendered);
      assert.equal(await page.locator('article table').count(), 2);
      await page.locator('article img').evaluateAll(async images => { await Promise.all(images.map(i=>i.decode())); if(images.some(i=>!i.naturalWidth))throw new Error('Markdown 本地图片无法显示'); });
      // Moving the MD and images together must preserve portable relative references.
      const moved=path.join(temp,'移动验证'); await mkdir(moved);
      await cp(path.join(result.outputDir,'images'),path.join(moved,'images'),{recursive:true});
      await cp(path.join(result.outputDir,names.markdown),path.join(moved,names.markdown));
      await writeFile(path.join(moved,'preview.html'),`<article>${rendered}</article>`,'utf8');
      await page.goto(pathToFileURL(path.join(moved,'preview.html')).href);
      const widths=await page.locator('article img').evaluateAll(async images=>{await Promise.all(images.map(i=>i.decode()));return images.map(i=>i.naturalWidth);});
      assert.deepEqual(widths,[1,1]);
      assert.match(md,/y = x\^2/);
      assert.equal(await page.locator('article math').count(), 1);
      const clean = await page.evaluate(sanitizeMarkdownHtml, '<script>alert(1)</script><a href="javascript:alert(1)" onclick="bad()">链接</a><img src="file:///private"><svg><foreignObject>unsafe</foreignObject></svg>');
      assert.ok(!/script|onclick|javascript|file:|foreignObject/.test(clean));
    } finally { await browser.close(); }
    assert.equal(result.metadata.offline_check.missingImages, 0);
    assert.equal(result.metadata.offline_check.images, 2);
    assert.equal(result.status, 'completed');
    const partial = await archiveArticle({ id: randomUUID(), url: origin + '/s/broken', source: 'fixture' }, { archiveDir: temp, width: 430 }, () => {}, { fixtureOrigin: origin });
    assert.equal(partial.status, 'partial');
    assert.equal(partial.metadata.failed_images.length, 1);
    assert.match(partial.metadata.failed_images[0].reason, /不是可识别的图片/);
    assert.ok(partial.metadata.warnings.length);
    const partialMd = await readFile(path.join(partial.outputDir, partial.metadata.file_names.markdown), 'utf8');
    assert.ok(partialMd.includes(origin + '/fake.png'));
    const tall = await archiveArticle({ id: randomUUID(), url: origin + '/s/tall', source: 'fixture' }, { archiveDir: temp, width: 430 }, () => {}, { fixtureOrigin: origin });
    assert.equal(tall.metadata.screenshots.length,2);
    assert.ok(tall.metadata.screenshots.every(name => tall.metadata.files[name].height > 105000));
    assert.equal((await readdir(tall.outputDir)).length,6);
  } finally {
    await new Promise(resolve => server.close(resolve));
    const target = path.resolve(temp);
    if (target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('wx2md-archive-test-')) await rm(target, { recursive: true, force: true });
  }
});
