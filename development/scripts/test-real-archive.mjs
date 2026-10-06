import { archiveArticle } from '../outputs/wx2md-local/src/archive.mjs';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const result = await archiveArticle({ id: randomUUID(), url: 'https://mp.weixin.qq.com/s/NfT-3GDq2sM2LNJlnXslYw', source: 'user-example' }, {
  archiveDir: new URL('../outputs/wx2md-local/archives/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), width: 430, showBrowser: false
}, stage => console.log(stage));
console.log(JSON.stringify(result, null, 2));
await writeFile(new URL('./real-archive-result.json', import.meta.url), JSON.stringify(result, null, 2));
