import { chromium } from '../outputs/wx2md-local-v1.1.0/node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';
const job = JSON.parse(await readFile(new URL('./wx2md-v110-result.json',import.meta.url),'utf8'));
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
 const page = await browser.newPage();
 page.on('console',m => {if (m.type()==='error') console.log(m.text().slice(0,260));});
 page.on('response',async r => {if(r.status()!==200)console.log(JSON.stringify({url:r.url(),status:r.status(),headers:await r.request().allHeaders()}));});
 await page.goto(`http://127.0.0.1:17880/files/${job.id}/original.html`);
 console.log(JSON.stringify(await page.locator('#js_content img').first().evaluate(e => ({src:e.src,width:e.naturalWidth,complete:e.complete})),null,2));
} finally {await browser.close();}
