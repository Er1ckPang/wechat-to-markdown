import { runtimeSettings, stopService } from './runtime.mjs';
try {
  const result = await stopService(await runtimeSettings());
  console.log(result.alreadyStopped ? '本地工具已经停止。' : '本地工具已停止。');
} catch (error) { console.error(error.message); process.exitCode = 1; }
