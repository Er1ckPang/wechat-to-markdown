import http from 'node:http';
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Store } from './store.mjs';
import { Worker } from './worker.mjs';
import { FeishuReceiver } from './feishu.mjs';
import { extractArticleUrls } from './urls.mjs';
import { screenshotViewer } from './html.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = packageInfo.releaseVersion || packageInfo.version;
const dataDir = path.join(root, 'data');
const configFile = path.join(dataDir, 'config.json');
await mkdir(dataDir, { recursive: true });
const defaults = { archiveDir: path.join(root, 'archives'), screenshotScale: 3, browser: 'auto', showBrowser: false,
  feishu: { enabled: false, appId: '', appSecret: '', allowedSenders: [] } };
let config;
try { const raw = JSON.parse(await readFile(configFile, 'utf8')); config = { ...defaults, ...raw, feishu: { ...defaults.feishu, ...raw.feishu } }; }
catch (error) { if (error.code !== 'ENOENT') throw new Error('本地设置文件损坏，请保留备份后修复 data/config.json。'); config = structuredClone(defaults); }
const store = new Store(path.join(dataDir, 'jobs.sqlite'));
const worker = new Worker(store, () => config);
const receiver = new FeishuReceiver(store, () => worker.kick(), () => config);
const port = Number(process.env.WX2MD_PORT || 17880);
const origin = `http://127.0.0.1:${port}`;
const token = randomBytes(32).toString('hex');
await writeFile(path.join(dataDir, 'api-token.txt'), token, { mode: 0o600 });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bmp': 'image/bmp' };
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
function publicConfig() { const value = structuredClone(config); value.feishu.hasSecret = !!value.feishu.appSecret; delete value.feishu.appSecret; return value; }
function authorized(req) {
  const supplied = String(req.headers['x-wx2md-token'] || String(req.headers.authorization || '').replace(/^Bearer /, ''));
  return supplied.length === token.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
}
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 64000) throw new Error('提交内容过长。'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new Error('提交格式无效。'); }
}
function openFolder(directory) {
  const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(command, [directory], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {}); child.unref();
}
async function serveFile(res, filename, archive = false) {
  const info = await stat(filename);
  if (!info.isFile()) throw new Error('文件不存在。');
  const type = mime[path.extname(filename)] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type, 'Content-Length': info.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    ...(archive ? { 'Content-Security-Policy': `sandbox allow-same-origin${path.extname(filename) === '.html' ? ' allow-popups allow-popups-to-escape-sandbox allow-downloads' : ''}; default-src 'none'; img-src data: blob: 'self'; style-src 'unsafe-inline' data:; font-src data:;` } : {})
  });
  createReadStream(filename).on('error', () => res.destroy()).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${port}`) return json(res, 403, { error: '请使用本机 127.0.0.1 地址。' });
    if (req.headers.origin && req.headers.origin !== origin) return json(res, 403, { error: '不接受其他网站提交。' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: '不接受跨站访问。' });
    const url = new URL(req.url, origin);
    const pathname = url.pathname;
    if (req.method === 'GET' && pathname === '/health') return json(res, 200, { app: 'wx2md-local', version, root });
    if (req.method === 'GET' && pathname === '/api/session') return json(res, 200, { token });
    if (pathname.startsWith('/api/') && !authorized(req)) return json(res, 403, { error: '页面连接已过期，请刷新。' });
    if (req.method === 'GET' && pathname === '/api/status') return json(res, 200, { version, root, config: publicConfig(), feishu: receiver.status(), jobs: store.list(), busy: worker.busy, archiveDir: config.archiveDir });
    if (req.method === 'POST' && pathname === '/api/jobs') {
      const input = await body(req);
      const urls = extractArticleUrls(input.text || input.url || '');
      if (!urls.length) throw new Error('没有找到可保存的文章链接。支持公众号、知乎专栏或回答、CSDN、博客园和普通文章网页。');
      if (urls.length > 20) throw new Error('每次最多提交 20 个链接。');
      const results = urls.map(url => store.enqueue(url, 'manual', '', !!input.force));
      worker.kick(); return json(res, 202, { results });
    }
    if (req.method === 'POST' && pathname === '/api/simulate-message') {
      const input = await body(req); const urls = extractArticleUrls(input.text || '');
      if (!urls.length) throw new Error('测试消息需要包含可保存的文章链接。');
      if (urls.length > 20) throw new Error('每次最多提交 20 个链接。');
      const result = store.enqueueMessage('simulation:' + randomUUID(), urls, 'message-test');
      worker.kick(); return json(res, 202, result);
    }
    if (req.method === 'POST' && pathname === '/api/config') {
      const input = await body(req);
      const next = structuredClone(config);
      if (typeof input.archiveDir === 'string' && input.archiveDir.trim()) next.archiveDir = path.resolve(input.archiveDir.trim());
      if (input.screenshotScale !== undefined) { const scale = Number(input.screenshotScale); if (![1, 2, 3, 4].includes(scale)) throw new Error('请选择 1 至 4 倍截图清晰度。'); next.screenshotScale = scale; }
      if (input.showBrowser !== undefined) next.showBrowser = !!input.showBrowser;
      if (input.feishu) {
        next.feishu.enabled = !!input.feishu.enabled;
        next.feishu.appId = String(input.feishu.appId || '').trim();
        if (input.feishu.clearSecret) next.feishu.appSecret = '';
        else if (input.feishu.appSecret) next.feishu.appSecret = String(input.feishu.appSecret).trim();
        next.feishu.allowedSenders = String(input.feishu.allowedSenders || '').split(/[\s,，]+/).filter(Boolean);
        if (next.feishu.enabled && (!next.feishu.appId || !next.feishu.appSecret)) throw new Error('启用飞书前请填写 App ID 和 App Secret。');
      }
      await mkdir(next.archiveDir, { recursive: true });
      await writeFile(configFile + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 });
      await rename(configFile + '.tmp', configFile);
      const feishuChanged = JSON.stringify(config.feishu) !== JSON.stringify(next.feishu);
      config = next;
      if (feishuChanged) receiver.start();
      return json(res, 200, { config: publicConfig(), feishu: receiver.status() });
    }
    if (req.method === 'POST' && pathname === '/api/feishu/reconnect') { receiver.start(); return json(res, 200, receiver.status()); }
    const jobAction = /^\/api\/jobs\/([a-f0-9-]+)\/(retry|folder)$/.exec(pathname);
    if (req.method === 'POST' && jobAction) {
      const job = store.get(jobAction[1]); if (!job) throw new Error('任务不存在。');
      if (jobAction[2] === 'retry') { const result = store.retry(job.id); worker.kick(); return json(res, 202, result); }
      if (!job.output_dir) throw new Error('任务尚未生成文件。');
      openFolder(job.output_dir); return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/open-archive') { await mkdir(config.archiveDir, { recursive: true }); openFolder(config.archiveDir); return json(res, 200, { ok: true }); }
    if (req.method === 'POST' && pathname === '/api/stop') {
      if (worker.busy) return json(res, 409, { error: '正在保存文章，请等待完成后再停止。' });
      json(res, 200, { ok: true }); setTimeout(shutdown, 250); return;
    }
    const viewerPath = /^\/view\/([a-f0-9-]+)\/(mobile|desktop)$/.exec(pathname);
    if (req.method === 'GET' && viewerPath) {
      const job = store.get(viewerPath[1]);
      const profile = job?.metadata?.screenshot_profiles?.[viewerPath[2]];
      if (!profile || !job.output_dir) return json(res, 404, { error:'长图不存在。' });
      const label = viewerPath[2] === 'mobile' ? '手机' : '电脑';
      const html = screenshotViewer({title:`${job.title} · ${label}`}, [`/files/${job.id}/${encodeURIComponent(profile.file)}`], job.metadata.screenshot_scale, null);
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"sandbox allow-same-origin allow-downloads; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline';"});
      return res.end(html);
    }
    const archivePath = /^\/files\/([a-f0-9-]+)\/(.+)$/.exec(pathname);
    if (req.method === 'GET' && archivePath) {
      const job = store.get(archivePath[1]); if (!job?.output_dir) return json(res, 404, { error: '保存文件不存在。' });
      const relative = decodeURIComponent(archivePath[2]);
      const namedOutput = job.metadata?.format_version >= 4 && Object.values(job.metadata.file_names || {}).includes(relative) && path.basename(relative) === relative && !/[\\/]/.test(relative);
      const localImage = job.metadata?.format_version >= 4 && /^images\/\d+\.(?:png|jpg|webp|gif|svg|avif|bmp)$/.test(relative) && job.metadata.image_files?.some(image => image.path === relative);
      const legacyOutput = job.metadata?.format_version < 4 || !job.metadata?.format_version;
      if (!namedOutput && !localImage && !(legacyOutput && /^(?:article\.md|markdown\.html|original(?:-singlefile)?\.html|images\.html|screenshots\.html|original(?:-\d{3})?\.png|metadata\.json|images\/\d+\.(?:png|jpg|webp|gif|svg|avif|bmp))$/.test(relative))) return json(res, 404, { error: '文件不存在。' });
      return await serveFile(res, path.join(job.output_dir, relative), true);
    }
    if (req.method === 'GET' && ['/', '/app.js', '/style.css', '/guide.html', '/mac-guide.html', '/sites-guide.html'].includes(pathname)) {
      return await serveFile(res, path.join(root, 'public', pathname === '/' ? 'index.html' : pathname.slice(1)));
    }
    return json(res, 404, { error: '地址不存在。' });
  } catch (error) {
    if (!res.headersSent) json(res, 400, { error: error.code === 'ENOENT' ? '文件不存在。' : error.message });
    else res.destroy();
  }
});
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return; shuttingDown = true;
  worker.stop(); receiver.stop();
  server.close(() => { if (!worker.busy) { store.close(); process.exit(0); } });
  setTimeout(() => process.exit(0), 5000).unref();
}
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '端口已被占用；如果工具已启动，请直接打开本地页面。' : error.message); process.exit(1); });
server.listen(port, '127.0.0.1', () => {
  console.log(`在线文章本地保存已启动：${origin}`);
  worker.start(); receiver.start();
});
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
