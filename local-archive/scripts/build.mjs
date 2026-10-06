import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
await mkdir(new URL('../vendor/', import.meta.url), { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL('../node_modules/single-file-core/single-file.js', import.meta.url))],
  outfile: fileURLToPath(new URL('../vendor/singlefile.js', import.meta.url)),
  bundle: true, format: 'iife', globalName: 'singlefile', platform: 'browser',
  target: 'chrome120', minify: false, legalComments: 'inline'
});
console.log('离线网页保存组件已就绪。');
