import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, realpath, writeFile, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectService, startService, stopService, runtimeSettings } from '../scripts/runtime.mjs';
import { runtimeSupported } from '../scripts/doctor.mjs';
import { browserChannels, launchBrowser } from '../src/browser.mjs';

async function unusedPort() {
  const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function fixture() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'wx2md-runtime-中文 空格-'));
  const root = await realpath(temporary); const port = await unusedPort();
  return { root, version: '1.1.0.p', port, url: `http://127.0.0.1:${port}` };
}
async function removeFixture(root) {
  assert.ok(root.includes('wx2md-runtime-中文 空格-'));
  assert.ok(root.startsWith(await realpath(os.tmpdir()) + path.sep));
  await rm(root, { recursive: true, force: true });
}

test('浏览器缺失时回退，保留失败原因；Mac 两种架构共用 Chromium，Windows 优先 Edge', async () => {
  assert.deepEqual(browserChannels('auto', 'darwin'), ['chromium', 'chrome', 'msedge']);
  assert.deepEqual(browserChannels('auto', 'win32'), ['msedge', 'chrome', 'chromium']);
  assert.throws(() => browserChannels('safari'), /设置无效/);
  const calls = []; const browser = { fixture: true };
  assert.equal(await launchBrowser({ showBrowser: true, browser: 'auto' }, async options => {
    calls.push(options); if (calls.length < 2) throw new Error('fixture missing executable'); return browser;
  }), browser);
  assert.equal(calls.length, 2); assert.ok(calls.every(options => options.headless === false));
  await assert.rejects(launchBrowser({}, async () => { throw new Error('fixture no browser'); }), error => /没有可用/.test(error.message) && /fixture no browser/.test(error.cause.message));
  for (const version of ['18.20.0', '22.12.999']) assert.equal(runtimeSupported(version), false);
  for (const version of ['22.13.0', '24.0.0', '26.0.0']) assert.equal(runtimeSupported(version), true);
});

test('后台启动并发不重复，中文与空格目录可用；忙碌时拒绝停止，正常停止可重复', { timeout: 30000 }, async () => {
  const settings = await fixture(); let child;
  const script = path.join(settings.root, 'fixture-server.mjs');
  await writeFile(script, `import http from 'node:http';let busy=false;
    const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');
      if(req.url==='/health')res.end(JSON.stringify({app:'wx2md-local',version:'1.1.0.p',root:process.cwd()}));
      else if(req.url==='/api/session')res.end(JSON.stringify({token:'fixture-token'}));
      else if(req.url==='/fixture/busy'){busy=true;res.end('{}');}
      else if(req.url==='/fixture/idle'){busy=false;res.end('{}');}
      else if(req.url==='/api/stop'&&req.headers['x-wx2md-token']==='fixture-token'){
        if(busy){res.statusCode=409;res.end(JSON.stringify({error:'正在保存文章'}));}
        else{res.end('{}');setTimeout(()=>server.close(()=>process.exit(0)),20);}
      }else{res.statusCode=404;res.end('{}');}
    });server.listen(Number(process.env.WX2MD_PORT),'127.0.0.1');`);
  try {
    assert.equal((await inspectService(settings)).state, 'stopped');
    const results = await Promise.all([startService(settings, { serverPath: script }), startService(settings, { serverPath: script })]);
    assert.equal(results.filter(result => !result.reused).length, 1); child = results.find(result => result.pid)?.pid;
    assert.equal((await startService(settings, { serverPath: script })).reused, true);
    await fetch(settings.url + '/fixture/busy'); await assert.rejects(stopService(settings), /正在保存/);
    assert.equal((await inspectService(settings)).state, 'running');
    await fetch(settings.url + '/fixture/idle'); assert.equal((await stopService(settings)).alreadyStopped, false);
    assert.equal((await stopService(settings)).alreadyStopped, true);
    await assert.rejects(stat(path.join(settings.root, 'data/start.lock')), { code: 'ENOENT' });
  } finally {
    if (child) { try { process.kill(child); } catch {} }
    await removeFixture(settings.root);
  }
});

test('不同版本或其他程序占用端口时，不启动副本，也不发停止请求', async () => {
  const settings = await fixture(); const actions = []; let foreign = false;
  const server = http.createServer((req, res) => {
    actions.push(req.url);
    res.end(foreign ? '<html>another app</html>' : JSON.stringify({ app: 'wx2md-local', version: 'old', root: settings.root }));
  });
  await new Promise(resolve => server.listen(settings.port, '127.0.0.1', resolve));
  try {
    assert.equal((await inspectService(settings)).state, 'mismatch');
    await assert.rejects(startService(settings), /另一个目录或版本/);
    await assert.rejects(stopService(settings), /另一个目录或版本/);
    foreign = true; assert.equal((await inspectService(settings)).state, 'occupied');
    await assert.rejects(stopService(settings), /端口/);
    assert.ok(actions.every(action => action === '/health'));
  } finally { await new Promise(resolve => server.close(resolve)); await removeFixture(settings.root); }
});

test('Mac 启动文件采用 LF，原生系统可执行；运行目录解析实际路径和显示版本', async () => {
  const app = fileURLToPath(new URL('../', import.meta.url));
  for (const name of ['install-mac.command', 'start-mac.command', 'doctor-mac.command', 'stop-mac.command', 'scripts/mac-common.sh']) {
    const filename = path.join(app, name); const bytes = await readFile(filename);
    assert.ok(!bytes.includes(13), `${name} contains CRLF`);
    assert.ok(bytes.toString().startsWith('#!/bin/bash\n'));
    if (process.platform !== 'win32') assert.ok((await stat(filename)).mode & 0o111, `${name} is not executable`);
  }
  const settings = await runtimeSettings(app);
  const info = JSON.parse(await readFile(path.join(app, 'package.json'), 'utf8'));
  assert.equal(settings.root, await realpath(app)); assert.equal(settings.version, info.releaseVersion);
});
