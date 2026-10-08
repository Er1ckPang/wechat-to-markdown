import { readFile, mkdir, open, unlink, realpath } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function runtimeSettings(root = fileURLToPath(new URL('../', import.meta.url))) {
  const info = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const port = Number(process.env.WX2MD_PORT || 17880);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('WX2MD_PORT 必须是有效端口号。');
  return { root: await realpath(root), version: info.releaseVersion || info.version, port, url: `http://127.0.0.1:${port}` };
}

async function portIsOpen(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = result => { socket.destroy(); resolve(result); };
    socket.once('connect', () => finish(true)); socket.once('error', () => finish(false));
    socket.setTimeout(1000, () => finish(true));
  });
}

export async function inspectService(settings) {
  try {
    const response = await fetch(settings.url + '/health', { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return { state: 'occupied' };
    const health = await response.json();
    if (health.app !== 'wx2md-local') return { state: 'occupied' };
    const reportedRoot = typeof health.root === 'string' ? await realpath(health.root).catch(() => path.resolve(health.root)) : '';
    const same = health.version === settings.version && reportedRoot === settings.root;
    return { state: same ? 'running' : 'mismatch', health };
  } catch { return { state: await portIsOpen(settings.port) ? 'occupied' : 'stopped' }; }
}

export function serviceError(state, settings) {
  return state === 'mismatch'
    ? `另一个目录或版本正在运行。请在 ${settings.url} 的“保存设置”中停止旧服务，然后启动本目录。`
    : `端口 ${settings.port} 已被其他程序占用，请先关闭占用程序。`;
}

export async function startService(settings, { serverPath = path.join(settings.root, 'src/server.mjs'), timeout = 20000 } = {}) {
  const before = await inspectService(settings);
  if (before.state === 'running') return { reused: true };
  if (before.state !== 'stopped') throw new Error(serviceError(before.state, settings));
  const dataDir = path.join(settings.root, 'data'); await mkdir(dataDir, { recursive: true });
  const lockPath = path.join(dataDir, 'start.lock'); let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    for (let attempt = 0; attempt < 50; attempt++) {
      await sleep(200);
      const state = await inspectService(settings);
      if (state.state === 'running') return { reused: true };
      if (['occupied', 'mismatch'].includes(state.state)) throw new Error(serviceError(state.state, settings));
    }
    throw new Error('启动过程尚未结束。若上次启动被中断，确认后台已停止后删除 data/start.lock，再重试。');
  }
  let child; let childError;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }));
    const logs = path.join(settings.root, 'logs'); await mkdir(logs, { recursive: true });
    const output = openSync(path.join(logs, 'runtime.log'), 'a', 0o600); let errors;
    try {
      errors = openSync(path.join(logs, 'errors.log'), 'a', 0o600);
      child = spawn(process.execPath, ['--no-warnings', serverPath], {
        cwd: settings.root, detached: true, windowsHide: true,
        env: { ...process.env, WX2MD_PORT: String(settings.port) }, stdio: ['ignore', output, errors]
      });
      child.on('error', error => { childError = error; }); child.unref();
    } finally { closeSync(output); if (errors !== undefined) closeSync(errors); }
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await sleep(200);
      if (childError || child.exitCode !== null) throw new Error('后台启动失败，请查看 logs/errors.log。', { cause: childError });
      const status = await inspectService(settings);
      if (status.state === 'running') return { reused: false, pid: child.pid };
      if (['occupied', 'mismatch'].includes(status.state)) throw new Error(serviceError(status.state, settings));
    }
    child.kill();
    throw new Error('启动超时，请查看 logs/errors.log。');
  } finally { await lock.close(); await unlink(lockPath).catch(() => {}); }
}

export async function stopService(settings) {
  const status = await inspectService(settings);
  if (status.state === 'stopped') return { alreadyStopped: true };
  if (status.state !== 'running') throw new Error(serviceError(status.state, settings));
  const session = await (await fetch(settings.url + '/api/session', { signal: AbortSignal.timeout(2000) })).json();
  if (typeof session.token !== 'string') throw new Error('无法取得本地连接令牌。');
  const response = await fetch(settings.url + '/api/stop', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wx2md-Token': session.token },
    body: '{}', signal: AbortSignal.timeout(3000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '停止失败。');
  for (let attempt = 0; attempt < 40; attempt++) {
    await sleep(200);
    if ((await inspectService(settings)).state === 'stopped') return { alreadyStopped: false };
  }
  throw new Error('服务仍在退出，请稍候；没有强制终止正在保存的文章。');
}
