import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = packageInfo.releaseVersion || packageInfo.version;
let health;
try {
  const response = await fetch('http://127.0.0.1:17880/health', { signal: AbortSignal.timeout(2500) });
  if (!response.ok) process.exit(1);
  health = await response.json();
} catch { process.exit(2); }
if (health.app !== 'wx2md-local' || health.version !== version || !health.root || path.resolve(health.root) !== root) {
  console.error('Another app or version is running. Stop it from the local page before starting this version.');
  process.exit(1);
}
