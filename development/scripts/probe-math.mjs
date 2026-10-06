import { chromium } from '../outputs/wx2md-local-v1.1.0/node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const report = JSON.parse(await readFile(new URL('./wx2md-verification.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', route => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
  await page.goto(pathToFileURL(path.join(report.actual_article.outputDir, 'original.html')).href);
  console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#js_content math,#js_content [data-formula],#js_content [data-latex]')].map(e => ({html:e.outerHTML,context:e.parentElement.textContent.slice(0,400)}))),null,2));
} finally { await browser.close(); }
