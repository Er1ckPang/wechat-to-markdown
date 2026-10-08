import { readFile, stat, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { articleUrl, articleKey } from './urls.mjs';
import { NeedsManualError } from './link-state.mjs';

export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
export const importRoot = new URL('../data/browser-imports/', import.meta.url);
const extensions = new Set(['.html','.htm','.mhtml','.mht']);

export async function receiveImport(req, filename, directory = importRoot) {
  const extension = path.extname(filename).toLowerCase();
  if (!extensions.has(extension)) throw new Error('请选择 MHTML 单个网页文件，或 SingleFile 保存的内嵌 HTML。');
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_IMPORT_BYTES) throw new Error('单个导入文件不能超过 64 MB。');
    chunks.push(chunk);
  }
  if (!size) throw new Error('导入文件为空。');
  const bytes = Buffer.concat(chunks), id = randomUUID();
  await mkdir(directory, {recursive:true});
  await writeFile(new URL(id + extension, directory), bytes, {mode:0o600});
  return { id, extension, filename:path.basename(filename).slice(0,180), bytes:size, sha256:createHash('sha256').update(bytes).digest('hex') };
}

export function importFile(descriptor, directory = importRoot) {
  if (!descriptor || !/^[a-f0-9-]{36}$/.test(descriptor.id) || !extensions.has(descriptor.extension)) throw new Error('导入文件信息无效。');
  return new URL(descriptor.id + descriptor.extension, directory);
}
export async function removeImport(descriptor, directory = importRoot) { await rm(importFile(descriptor,directory),{force:true}); }

// Let Chromium parse MHTML instead of implementing a second MIME parser. Publisher
// scripts are disabled and network/file subresources blocked during this read.
export async function readBrowserImport(browser, descriptor, sourceUrl, directory = importRoot) {
  sourceUrl = articleUrl(sourceUrl);
  const filename = importFile(descriptor,directory), size = (await stat(filename)).size;
  if (size > MAX_IMPORT_BYTES || !size) throw new NeedsManualError('导入文件为空或超过 64 MB，请重新保存。');
  const bytes = await readFile(filename);
  if (createHash('sha256').update(bytes).digest('hex') !== descriptor.sha256) throw new NeedsManualError('导入文件已发生变化，请重新选择文件。');
  const context = await browser.newContext({javaScriptEnabled:false,offline:true,serviceWorkers:'block'});
  const resources = new Map();
  try {
    await context.route('**/*',route => route.request().url() === filename.href ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(filename.href,{waitUntil:'load',timeout:30000});
    const savedSources = await page.evaluate(() => [document.querySelector('link[rel="canonical"]')?.href,document.querySelector('meta[property="og:url"]')?.content,document.baseURI].filter(url=>/^https?:/.test(url || '')));
    if (savedSources.length && !savedSources.some(url=>{try{return articleKey(url)===articleKey(sourceUrl);}catch{return false;}})) {
      throw new NeedsManualError('文件中的文章地址与填写的链接不同。请填写实际保存的文章链接；迁移文章请使用新链接。');
    }
    const cdp = await context.newCDPSession(page); await cdp.send('Page.enable');
    const tree = await cdp.send('Page.getResourceTree');
    for (const resource of tree.frameTree.resources || []) {
      if (!['Image','Stylesheet','Font'].includes(resource.type) || !/^(?:https?:|data:|cid:)/.test(resource.url)) continue;
      try {
        const result = await cdp.send('Page.getResourceContent',{frameId:tree.frameTree.frame.id,url:resource.url});
        const content = Buffer.from(result.content,result.base64Encoded?'base64':'utf8');
        if (content.length && content.length <= 25*1024*1024) resources.set(resource.url,{bytes:content,type:resource.mimeType,status:200});
      } catch { /* Missing resources are reported by the normal archive pipeline. */ }
    }
    const html = await page.evaluate(sourceUrl => {
      const doc = document.documentElement.cloneNode(true), originals = [...document.querySelectorAll('img')];
      doc.querySelectorAll('img').forEach((image,index) => {
        const original = originals[index], src = original.currentSrc || original.src;
        if (/^(?:https?:|data:|cid:)/.test(src)) { image.src = src; image.setAttribute('data-src',src); }
        else { image.removeAttribute('src'); image.removeAttribute('data-src'); }
        for (const name of ['srcset','data-original','data-actualsrc']) image.removeAttribute(name);
        image.loading = 'eager';
      });
      for (const e of doc.querySelectorAll('[href],[src], [poster]')) for (const attribute of ['href','src','poster']) {
        if (!e.hasAttribute(attribute)) continue;
        try { const url = new URL(e.getAttribute(attribute),document.baseURI); if (['http:','https:','data:','cid:'].includes(url.protocol)) e.setAttribute(attribute,url.href); else e.removeAttribute(attribute); }
        catch { e.removeAttribute(attribute); }
      }
      doc.querySelectorAll('script,iframe,object,embed,form,base,meta[http-equiv="refresh" i],meta[http-equiv="content-security-policy" i],link[rel="modulepreload"],link[as="script"]').forEach(e=>e.remove());
      doc.querySelectorAll('*').forEach(e => { for (const a of [...e.attributes]) if (/^on/i.test(a.name)) e.removeAttribute(a.name); });
      const base = document.createElement('base'); base.href = sourceUrl; doc.querySelector('head').prepend(base);
      return '<!DOCTYPE html>' + doc.outerHTML;
    }, sourceUrl);
    return {html,resources,sourceUrl,provenance:{filename:descriptor.filename,bytes:size,sha256:descriptor.sha256,method:'user_saved_webpage',network_used:false}};
  } finally { await context.close(); }
}
