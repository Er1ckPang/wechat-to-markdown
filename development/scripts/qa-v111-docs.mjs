import {chromium}from '../outputs/wx2md-local-v1.1.1/node_modules/playwright/index.mjs';
import{fileURLToPath,pathToFileURL}from'node:url';
import assert from'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto('http://127.0.0.1:17880');await page.getByText('本地工具运行中',{exact:true}).waitFor();
 assert.ok(await page.locator('.job-meta').first().innerText().then(t=>t.includes('v1.1.1')));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.goto('http://127.0.0.1:17880/guide.html');
 assert.ok(await page.locator('#files').innerText().then(t=>t.includes('每个文件是什么')&&t.includes('只保留一种格式')));
 await page.goto(pathToFileURL(fileURLToPath(new URL('../outputs/wx2md-v1.1.1-验证记录.html',import.meta.url))).href);
 assert.equal(await page.locator('table').count(),2);
 console.log('新版版本标识、手机布局、文件说明与验证记录通过。');
}finally{await browser.close();}
