import { chromium } from '../outputs/wx2md-local-v1.1.0/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
  const page = await browser.newPage({viewport:{width:390,height:844}});
  await page.goto('http://127.0.0.1:17880');
  await page.getByText('本地工具运行中',{exact:true}).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button',{name:'保存设置',exact:true}).click();
  assert.equal(await page.locator('#screenshot-scale').inputValue(),'3');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.goto('http://127.0.0.1:17880/guide.html');
  assert.equal(await page.locator('#upgrade').count(),1);
  assert.ok(await page.locator('header').innerText().then(text=>text.includes('v1.1.0')));
  await page.setViewportSize({width:1280,height:1000});
  await page.locator('#files').scrollIntoViewIfNeeded();
  await page.screenshot({path:fileURLToPath(new URL('./wx2md-v110-guide-files.png',import.meta.url))});
  await page.goto(pathToFileURL(fileURLToPath(new URL('../outputs/wx2md-v1.1.0-验证记录.html',import.meta.url))).href);
  assert.equal(await page.locator('table tr').count(),16);
  console.log('新版页面手机布局、指南和验证记录通过。');
} finally {await browser.close();}
