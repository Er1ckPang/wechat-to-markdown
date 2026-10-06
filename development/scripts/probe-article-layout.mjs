import { chromium } from '../outputs/wx2md-local-v1.1.0/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const report = JSON.parse(await readFile(new URL('./wx2md-verification.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  await page.route('**/*', route => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
  await page.goto(pathToFileURL(path.join(report.actual_article.outputDir, 'original.html')).href);
  const layout = await page.evaluate(() => {
    const root = document.querySelector('#js_content');
    return {
      headings: [...root.querySelectorAll('h1,h2,h3,h4')].map(e => ({ tag: e.tagName, text: e.textContent.trim() })),
      styledCandidates: [...root.querySelectorAll('p,section,div')].filter(e => e.textContent.trim().length > 0 && e.textContent.trim().length < 100).map(e => {
        const s = getComputedStyle(e); const child = e.querySelector('span,strong'); const c = child && getComputedStyle(child);
        return { tag: e.tagName, text: e.textContent.trim(), size: s.fontSize, weight: s.fontWeight, align: s.textAlign, child: c ? { size: c.fontSize, weight: c.fontWeight } : null };
      }).slice(0, 65),
      images: [...root.querySelectorAll('img')].slice(0, 2).map(e => ({ attributes: [...e.attributes].filter(a => !a.value.startsWith('data:image') && a.value.length < 500).map(a => [a.name, a.value]), renderedWidth: e.getBoundingClientRect().width, naturalWidth: e.naturalWidth })),
      math: root.querySelectorAll('annotation,math,[data-formula],[data-latex],.katex,script[type="math/tex"]').length,
      tables: [...root.querySelectorAll('table')].map(e => ({ rows: e.rows.length, headings: e.querySelectorAll('th').length, merged: !!e.querySelector('[colspan],[rowspan]'), parent: e.parentElement.tagName })),
      policies: [...document.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]')].map(e => e.content)
    };
  });
  await writeFile(new URL('./article-layout-probe.json', import.meta.url), JSON.stringify(layout, null, 2));
  console.log(JSON.stringify(layout, null, 2));
} finally { await browser.close(); }
