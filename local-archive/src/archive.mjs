import { launchBrowser } from './browser.mjs';
export { launchBrowser } from './browser.mjs';
import { mkdir, readFile, writeFile, rename, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { articleUrl, articleSite, resourceAllowed, safeName, hash } from './urls.mjs';
import { createResourcePolicy } from './network.mjs';
import { inspectArticlePage, prepareArticlePage, expandPublicArticle } from './sites.mjs';
import { extractArticle } from './extract.mjs';
import { articleToMarkdown } from './markdown.mjs';
import { linkLocalImages } from './html.mjs';
import { captureScreenshot } from './screenshot.mjs';

export class NeedsManualError extends Error { name = 'NeedsManualError'; }
const singleFilePath = fileURLToPath(new URL('../vendor/singlefile.js', import.meta.url));
const packageInfo = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const toolVersion = packageInfo.releaseVersion || packageInfo.version;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function imageExtension(bytes, type) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())) return 'gif';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (bytes.subarray(4, 8).toString() === 'ftyp' && /avif|avis/.test(bytes.subarray(8, 32).toString())) return 'avif';
  if (bytes.subarray(0, 2).toString() === 'BM') return 'bmp';
  if (type.includes('image/svg+xml') && /<svg[\s>]/i.test(bytes.toString('utf8'))) return 'svg';
  throw new Error('返回内容不是可识别的图片。');
}

async function loadImages(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-wx2md-body] img, #js_content img').forEach(image => {
      const src = image.getAttribute('data-src');
      if (src && image.getAttribute('src') !== src) image.src = src;
      image.loading = 'eager';
    });
  });
  for (let step = 0; step < 160; step++) {
    const done = await page.evaluate(() => {
      window.scrollBy(0, Math.max(500, innerHeight * 0.85));
      return scrollY + innerHeight >= document.documentElement.scrollHeight - 5;
    });
    await sleep(80);
    if (done) break;
  }
  await page.evaluate(async () => {
    await Promise.race([
      Promise.all([...document.querySelectorAll('[data-wx2md-body] img, #js_content img')].map(image => image.decode().catch(() => {}))),
      new Promise(resolve => setTimeout(resolve, 18000))
    ]);
    await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 6000))]);
    scrollTo(0, 0);
  });
  await sleep(700);
}

export async function archiveArticle(job, config, onStage = () => {}, testOptions = {}) {
  // fixtureOrigin is injectable only through tests, never through the public HTTP API.
  const fixtureOrigin = testOptions.fixtureOrigin;
  const sourceUrl = fixtureOrigin ? job.url : articleUrl(job.url);
  let site = fixtureOrigin ? testOptions.site || { platform: 'wechat', label: '微信公众号', kind: 'article' } : articleSite(sourceUrl);
  const allowed = createResourcePolicy(site.platform, { fixtureOrigin });
  const captureScale = [1, 2, 3, 4].includes(Number(config.screenshotScale)) ? Number(config.screenshotScale) : 3;
  const browser = await launchBrowser(config);
  const warnings = []; const failedResources = new Set(); const failedImages = []; const auxiliaryRequests = new Set();
  let context, stageDirectory, finalDirectory;
  const maxTime = setTimeout(() => browser.close().catch(() => {}), 300000);
  try {
    context = await browser.newContext({ viewport: { width: site.platform === 'wechat' ? 432 : 1280, height: 768 }, deviceScaleFactor: captureScale, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', colorScheme: 'light', serviceWorkers: 'block' });
    let page = await context.newPage();
    const cache = new Map();
    context.on('response', response => {
      const url = response.url();
      const type = response.headers()['content-type'] || '';
      if (resourceAllowed(url, fixtureOrigin, site.platform) && response.ok() && /image\/|text\/css|font\/|application\/(?:font|octet-stream)/.test(type)) {
        cache.set(url, response.body().then(bytes => bytes.length <= 25 * 1024 * 1024 ? { bytes, type, status: response.status() } : null).catch(() => null));
      }
    });
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (await allowed(url)) await route.continue().catch(() => {});
      else {
        if (new URL(url).hostname === 'badjs.weixinbridge.com') auxiliaryRequests.add(url);
        else if (['image', 'stylesheet', 'font'].includes(route.request().resourceType())) failedResources.add(url);
        await route.abort().catch(() => {});
      }
    });
    onStage('打开文章');
    const response = await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(async error => {
      if (!(await page.evaluate(inspectArticlePage, site)).ready) throw error;
    });
    if (response && response.status() >= 400 && !config.showBrowser) {
      throw new NeedsManualError(`${site.label}返回 HTTP ${response.status()}，未保存错误页面。请确认文章可访问，或启用“显示采集浏览器”后重试。`);
    }
    if (!fixtureOrigin && site.platform === 'web') {
      try {
        const resolved = articleSite(page.url());
        if (resolved.platform !== 'web') {
          site = resolved;
          await page.setViewportSize({ width: site.platform === 'wechat' ? 432 : 1280, height: 768 });
        }
      } catch { /* The body check below classifies login pages without saving them. */ }
    }
    if (await page.evaluate(expandPublicArticle, site)) await sleep(500);
    let info = await page.evaluate(inspectArticlePage, site);
    const deadline = Date.now() + (config.showBrowser ? 90000 : 12000);
    while (!info.ready && Date.now() < deadline) { await sleep(500); info = await page.evaluate(inspectArticlePage, site); }
    if (!info.ready) throw new NeedsManualError(`无法读取${site.label}的单篇文章正文。页面可能需要登录、验证或没有可识别的文章。可启用“显示采集浏览器”后重试；不保存登录或验证页面。`);
    if (!fixtureOrigin) {
      try {
        const resolved = articleSite(articleUrl(page.url()));
        if (site.platform !== 'web' && (resolved.platform !== site.platform || (site.itemId && resolved.itemId !== site.itemId))) throw new Error('不是同一篇文章');
      }
      catch { throw new NeedsManualError('文章跳转到验证或登录页面，请人工确认后重试。'); }
    }
    if (info.restricted) throw new NeedsManualError('页面有登录或付费正文限制。请先通过网站正常登录或授权，再在显示采集浏览器的模式下重试。');
    if (info.collapsed) warnings.push('页面正文有折叠提示；请对照原文确认完整性。');
    if (info.interactive) warnings.push('文章包含视频、音频或交互组件；保存的是可见静态内容。');
    await page.evaluate(prepareArticlePage, { site, info });
    onStage('加载正文图片与排版');
    await loadImages(page);
    const resolvedSourceUrl = page.url();
    if (site.platform !== 'wechat') {
      // Some sites replace built-in JS methods. Run the archive library in a fresh,
      // script-free document while retaining the selected DOM, CSS and source base URL.
      const snapshot = await page.evaluate(() => {
        const doc = document.documentElement.cloneNode(true);
        doc.querySelectorAll('script,iframe,base,meta[http-equiv="refresh" i],meta[http-equiv="content-security-policy" i],link[rel="modulepreload"],link[as="script"]').forEach(e => e.remove());
        const base = document.createElement('base'); base.href = location.href;
        doc.querySelector('head').prepend(base);
        return '<!DOCTYPE html>' + doc.outerHTML;
      });
      const originalPage = page;
      page = await context.newPage();
      await page.setContent(snapshot, { waitUntil: 'load', timeout: 45000 });
      await originalPage.close();
      await loadImages(page);
    }
    const article = await page.evaluate(extractArticle, { site, info: { ...info, sourceUrl: resolvedSourceUrl } });
    article.sourceUrl = resolvedSourceUrl;
    if (!article.bodyTextLength && !article.images.length) throw new NeedsManualError('文章正文为空，请确认链接仍可访问。');
    if (article.interactive) warnings.push('文章包含视频、音频或交互组件；保存的是可见静态内容。');
    if (article.unresolvedImages.length) warnings.push(`原页面有 ${article.unresolvedImages.length} 张正文图片未成功显示，长截图可能缺图。`);
    const savedAt = new Date();
    const account = safeName(article.accountName || site.label, 35);
    const directoryName = `${savedAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })}_${safeName(article.title, 55)}_${job.id.slice(0, 8)}`;
    finalDirectory = site.platform === 'wechat' ? path.join(path.resolve(config.archiveDir), account, directoryName)
      : path.join(path.resolve(config.archiveDir), site.label, account, directoryName);
    const stagingRoot = path.join(path.resolve(config.archiveDir), '.staging');
    stageDirectory = path.join(stagingRoot, `${job.id}-${Date.now()}`);
    await mkdir(path.join(stageDirectory, 'images'), { recursive: true });
    // Leave room for Windows paths and the longest suffix; normalize unsafe title characters.
    const titleStem = safeName(article.title, Math.max(12, Math.min(70, 240 - finalDirectory.length - 15)));
    const fileNames = { markdown: `${titleStem}.md`, html: `${titleStem}.html`,
      mobile: `${titleStem}_手机.png`, desktop: `${titleStem}_电脑.png`, metadata: `${titleStem}_metadata.json` };

    async function getResource(input, redirects = 0) {
      const url = new URL(input, resolvedSourceUrl).href;
      if (!(await allowed(url))) throw new Error('资源地址不可访问或指向非公网地址。');
      if (url.startsWith('data:')) {
        const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(url);
        if (!match) throw new Error('无效的内嵌资源。');
        return { bytes: Buffer.from(match[2] ? match[3] : decodeURIComponent(match[3]), match[2] ? 'base64' : 'utf8'), type: match[1], status: 200 };
      }
      const cached = await cache.get(url);
      if (cached && cached.bytes.length) return cached;
      if (redirects > 4) throw new Error('资源重定向次数过多。');
      let lastError;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await context.request.get(url, { timeout: 18000, maxRedirects: 0, headers: { Referer: site.platform === 'wechat' ? '' : article.sourceUrl } });
          const headers = response.headers();
          if ([301, 302, 303, 307, 308].includes(response.status()) && headers.location) {
            await response.dispose(); return getResource(new URL(headers.location, url).href, redirects + 1);
          }
          if (!response.ok()) { const code = response.status(); await response.dispose(); throw new Error(`HTTP ${code}`); }
          const bytes = await response.body();
          await response.dispose();
          if (bytes.length > 25 * 1024 * 1024) throw new Error('单个资源超过 25 MB。');
          const result = { bytes, type: headers['content-type'] || '', status: 200 };
          cache.set(url, Promise.resolve(result)); return result;
        } catch (error) { lastError = error; if (!attempt) await sleep(500); }
      }
      failedResources.add(url); throw lastError;
    }

    onStage('保存 Markdown 本地原图');
    const mapping = {}; const embeddedMapping = {}; const imageFiles = [];
    for (const [index, src] of [...new Set(article.images.map(image => image.src))].entries()) {
      try {
        const { bytes, type } = await getResource(src);
        const extension = imageExtension(bytes, type);
        const mime = { png:'image/png', jpg:'image/jpeg', gif:'image/gif', webp:'image/webp', avif:'image/avif', bmp:'image/bmp', svg:'image/svg+xml' }[extension];
        const localPath = `images/${String(index + 1).padStart(3, '0')}.${extension}`;
        await writeFile(path.join(stageDirectory, localPath), bytes);
        mapping[src] = localPath;
        embeddedMapping[src] = `data:${mime};base64,${bytes.toString('base64')}`;
        const description = article.images.find(image => image.src === src);
        imageFiles.push({ path: localPath, index: index + 1, mime, source: src, alt: description?.alt || '', width: description?.width || null, height: description?.height || null, bytes: bytes.length, sha256: hash(bytes) });
      } catch (error) { failedImages.push({ url: src, reason: error.message }); }
    }
    if (failedImages.length) warnings.push(`${failedImages.length} 张 Markdown 图片下载失败，保留了原链接。`);
    article.html = await page.evaluate(({ html, mapping }) => {
      const container = document.createElement('div'); container.innerHTML = html;
      container.querySelectorAll('img').forEach(image => {
        const replacement = mapping[image.getAttribute('src')];
        if (replacement) image.setAttribute('src', replacement);
      });
      return container.innerHTML;
    }, { html: article.html, mapping });
    const markdown = articleToMarkdown(article, savedAt);
    await writeFile(path.join(stageDirectory, fileNames.markdown), markdown, 'utf8');

    onStage('保存含图片和样式的离线 HTML');
    await page.exposeFunction('__wx2mdFetch', async input => {
      try {
        const result = await getResource(input);
        return { data: result.bytes.toString('base64'), type: result.type, status: result.status };
      } catch (error) { return { error: error.message }; }
    });
    await page.addScriptTag({ path: singleFilePath });
    const html = await page.evaluate(async resolvedSourceUrl => {
      const data = await singlefile.getPageData({
        url: resolvedSourceUrl, filenameTemplate: 'original.html', filenameMaxLength: 190,
        blockScripts: true, blockVideos: true, blockAudios: true, blockFonts: false,
        removeFrames: true, removeHiddenElements: false, removeUnusedStyles: false,
        compressHTML: false, compressContent: false, loadDeferredContent: false,
        saveOriginalURLs: true, insertMetaCSP: true, insertCanonicalLink: true, insertSingleFileComment: true,
        maxResourceSizeEnabled: true, maxResourceSize: 25, networkTimeout: 20000,
        removeAlternativeFonts: false, removeAlternativeImages: false, groupDuplicateImages: false
      }, {
        fetch: async url => {
          const result = await globalThis.__wx2mdFetch(String(url));
          if (result.error) throw new Error(result.error);
          const bytes = Uint8Array.from(atob(result.data), ch => ch.charCodeAt(0));
          return { status: result.status, headers: new Headers({ 'content-type': result.type }), arrayBuffer: async () => bytes.buffer };
        }
      });
      return data.content;
    }, resolvedSourceUrl);
    if (!html || !html.includes('data-wx2md-body')) throw new Error('离线 HTML 未包含文章正文。');
    const embeddedHtml = await page.evaluate(linkLocalImages, { html, mapping: embeddedMapping, embedded: true });
    if (embeddedHtml.linked < article.images.filter(image => mapping[image.src]).length) warnings.push('部分 HTML 图片未能替换为下载到的原图。');
    await writeFile(path.join(stageDirectory, fileNames.html), embeddedHtml.html, 'utf8');

    onStage('检查离线文件');
    const offlinePage = await context.newPage();
    await offlinePage.route('**/*', route => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
    await offlinePage.goto(pathToFileURL(path.join(stageDirectory, fileNames.html)).href, { waitUntil: 'load', timeout: 30000 });
    const offlineCheck = await offlinePage.evaluate(async () => {
      const content = document.querySelector('[data-wx2md-body], #js_content');
      await Promise.all([...content.querySelectorAll('img')].map(i => i.decode().catch(() => {})));
      return {
        bodyPresent: !!content,
        bodyTextLength: (content?.textContent || '').trim().length,
        images: content.querySelectorAll('img').length,
        missingImages: [...content.querySelectorAll('img')].filter(i => !i.naturalWidth).length,
        remoteImages: [...content.querySelectorAll('img')].filter(i => /^https?:/.test(i.src)).length,
        remoteStylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].filter(i => /^https?:/.test(i.href)).length,
        embeddedImages: [...content.querySelectorAll('img')].filter(i => /^data:image\//.test(i.getAttribute('src') || '')).length,
        openableImages: content.querySelectorAll('img[data-wx2md-original-image]').length
      };
    });
    await offlinePage.close();
    const profiles = { mobile: { width:432, height:768, ratio:'9:16', label:'手机' }, desktop: { width:1280, height:720, ratio:'16:9', label:'电脑' } };
    const screenshotProfiles = {};
    const screenshotFiles = [];
    for (const [name, profile] of Object.entries(profiles)) {
      onStage(`按${profile.label}阅读窗口排版并检查长图接缝`);
      const capturePage = await context.newPage();
      try {
        await capturePage.setViewportSize({width:profile.width,height:profile.height});
        await capturePage.route('**/*', route => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
        await capturePage.goto(pathToFileURL(path.join(stageDirectory,fileNames.html)).href, {waitUntil:'load',timeout:30000});
        const captured = await captureScreenshot(capturePage, stageDirectory, warnings, captureScale, onStage,
          { stem:path.basename(fileNames[name],'.png'), label:profile.label, fitToViewport:true, cropToArticle:true, singleFile:true });
        screenshotProfiles[name] = { viewport: {width:profile.width,height:profile.height,ratio:profile.ratio,deviceScaleFactor:captureScale}, file:fileNames[name], check:captured.check };
        screenshotFiles.push(...captured.files);
      } finally { await capturePage.close(); }
    }
    if (!offlineCheck.bodyPresent) throw new Error('离线检查未找到正文。');
    if (offlineCheck.missingImages) warnings.push(`断网检查发现 HTML 正文有 ${offlineCheck.missingImages} 张图片未显示。`);
    if (offlineCheck.remoteImages || offlineCheck.remoteStylesheets) warnings.push('离线 HTML 仍有远程图片或样式引用。');
    if (failedResources.size) warnings.push(`${failedResources.size} 个页面资源未能保存，详情见标题命名的 metadata 文件。`);
    const fileInfo = {};
    for (const name of [fileNames.markdown, fileNames.html, ...screenshotFiles, ...imageFiles.map(image => image.path)]) {
      const bytes = await readFile(path.join(stageDirectory, name));
      if (!bytes.length) throw new Error(`${name} 文件为空。`);
      fileInfo[name] = { bytes: bytes.length, sha256: hash(bytes), ...(name.endsWith('.png') ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : {}) };
    }
    const metadata = {
      format_version: 4, tool: 'wx2md-local', tool_version: toolVersion, status: warnings.length ? 'partial' : 'completed',
      title: article.title, account: article.accountName, author: article.author, published_at: article.publishTime,
      site: site.platform, site_name: site.label, article_kind: site.kind, extraction: article.extraction,
      original_url: job.url, resolved_url: article.sourceUrl, saved_at: savedAt.toISOString(), timezone: 'Asia/Shanghai',
      source: job.source || 'manual', browser: browser.version(), platform: process.platform,
      file_names: fileNames, files: fileInfo, screenshots: screenshotFiles, screenshot_scale: captureScale,
      screenshot_profiles: screenshotProfiles, image_files: imageFiles,
      html_files: [fileNames.html], html_images: {mode:'embedded-originals',linked:embeddedHtml.linked,original_bytes_preserved:true},
      markdown_images: { mode:'local-originals',directory:'images/',paths:Object.values(mapping),count:imageFiles.length,original_bytes_preserved:true },
      failed_images: failedImages, failed_resources: [...failedResources], markdown_structure: article.structure,
      warnings: [...new Set(warnings)], offline_check: offlineCheck, omitted_statistics_requests: [...auxiliaryRequests]
    };
    await writeFile(path.join(stageDirectory, fileNames.metadata), JSON.stringify(metadata, null, 2), 'utf8');
    await mkdir(path.dirname(finalDirectory), { recursive: true });
    try { await stat(finalDirectory); finalDirectory += '_' + Date.now(); } catch { /* 新目录 */ }
    await rename(stageDirectory, finalDirectory); stageDirectory = null;
    return { title: article.title, outputDir: finalDirectory, metadata, status: metadata.status };
  } finally {
    clearTimeout(maxTime);
    await browser.close().catch(() => {});
    const expectedRoot = path.resolve(config.archiveDir, '.staging');
    if (stageDirectory && path.resolve(stageDirectory).startsWith(expectedRoot + path.sep)) {
      await rm(stageDirectory, { recursive: true, force: true }).catch(() => {});
    }
  }
}
