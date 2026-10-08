import { readFile, writeFile } from 'node:fs/promises';
import { marked } from '../vendor/marked.mjs';
const markdown = await readFile(new URL('../MAC_GUIDE.md', import.meta.url), 'utf8');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mac 安装与启动指南 · wx2md Local</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f4f4ef;color:#243429;font:15px/1.85 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}main{max-width:940px;margin:auto;padding:35px 30px 70px}a{color:#276448}h1{font-size:30px;line-height:1.4}h2{margin-top:35px;font-size:22px}code{background:#e8eee4;border-radius:4px;padding:2px 5px;overflow-wrap:anywhere}pre{background:#223a2b;color:#eaf2e8;border-radius:8px;padding:18px;overflow:auto}pre code{background:none;overflow-wrap:normal;padding:0}table{width:100%;border-collapse:collapse;background:#fff}td,th{border:1px solid #dce3d9;text-align:left;padding:10px}th{background:#e9eee5}li{margin:9px 0}nav{display:flex;gap:20px;border-bottom:1px solid #dce3d9;padding-bottom:15px}@media(max-width:600px){main{padding:24px 18px}h1{font-size:25px}table{font-size:13px}}
</style></head><body><main><nav><a href="guide.html">完整使用指南</a><a href="http://127.0.0.1:17880/">打开本地工具</a></nav>${marked.parse(markdown)}</main></body></html>\n`;
await writeFile(new URL('../public/mac-guide.html', import.meta.url), html, 'utf8');
console.log('Mac 离线使用指南已更新。');
