import { spawn } from 'node:child_process';
import { runtimeSettings, startService, inspectService } from './runtime.mjs';
import { checkEnvironment } from './doctor.mjs';
try {
  const settings = await runtimeSettings();
  if ((await inspectService(settings)).state !== 'running') await checkEnvironment();
  const result = await startService(settings);
  console.log(`${result.reused ? '已在运行' : '启动完成'}：${settings.url}`);
  if (!process.argv.includes('--no-open') && process.env.WX2MD_NO_OPEN !== '1') {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
    const opener = spawn(command, [settings.url], { detached: true, windowsHide: true, stdio: 'ignore' });
    opener.on('error', () => console.log(`请在浏览器手动打开 ${settings.url}`)); opener.unref();
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
