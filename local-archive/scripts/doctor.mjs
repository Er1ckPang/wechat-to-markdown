import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeSettings, inspectService, serviceError } from './runtime.mjs';

export function runtimeSupported(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return major > 22 || (major === 22 && (minor > 13 || (minor === 13 && patch >= 0)));
}

export async function checkEnvironment({ browserOnly = false, root = fileURLToPath(new URL('../', import.meta.url)), output = console.log } = {}) {
  if (!runtimeSupported(process.versions.node)) throw new Error('需要 Node.js 22.13+，建议从 https://nodejs.org/en/download 安装 Node.js 24 LTS。');
  if (!browserOnly) {
    output(`Node.js ${process.versions.node} · ${process.platform} / ${process.arch}`);
    if (process.platform === 'darwin') {
      const version = execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim();
      if (Number(version.split('.')[0]) < 14) throw new Error('此版本需要 macOS 14 Sonoma 或更新系统。');
      if (!['arm64', 'x64'].includes(process.arch)) throw new Error('仅支持 Apple Silicon 或 Intel 64 位 Mac。');
      output(`macOS ${version}`);
    }
    const { DatabaseSync } = await import('node:sqlite');
    const database = new DatabaseSync(':memory:');
    try { database.exec('CREATE TABLE environment_check (value TEXT)'); } finally { database.close(); }
    await access(root, constants.W_OK); output('SQLite 与目录写入权限正常');
    try {
      await import('../src/archive.mjs');
      await import('../src/feishu.mjs');
      await access(path.join(root, 'vendor/singlefile.js'), constants.R_OK);
      output('归档与消息依赖正常');
    } catch (error) {
      throw new Error('依赖或离线网页组件不完整，请重新安装锁定依赖；Mac 可运行 install-mac.command。', { cause: error });
    }
    try {
      const config = JSON.parse(await readFile(path.join(root, 'data/config.json'), 'utf8'));
      if (process.platform === 'darwin' && /^[A-Za-z]:[\\/]/.test(config.archiveDir || '')) throw new Error('设置中仍是 Windows 保存路径。请使用全新 Mac 配置，不要直接复制 Windows 的 data/；文章可单独复制。');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let browser;
  try {
    const { launchBrowser } = await import('../src/browser.mjs');
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent('<meta charset="utf-8"><h1>公众号归档 · 浏览器检查</h1>');
    const screenshot = await page.screenshot();
    if (screenshot.subarray(1, 4).toString() !== 'PNG') throw new Error('浏览器渲染检查失败。');
    output(`浏览器启动与 PNG 渲染正常 · ${browser.version()}`);
  } finally { await browser?.close(); }
  if (!browserOnly) {
    const settings = await runtimeSettings(root); const service = await inspectService(settings);
    if (['mismatch', 'occupied'].includes(service.state)) throw new Error(serviceError(service.state, settings));
    output(service.state === 'running' ? `本目录服务正在运行：${settings.url}` : `环境就绪，可以启动：${settings.url}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await checkEnvironment({ browserOnly: process.argv.includes('--browser-only') }); }
  catch (error) { console.error(error.message); if (error.cause) console.error(String(error.cause.message).slice(0, 2500)); process.exitCode = 1; }
}
