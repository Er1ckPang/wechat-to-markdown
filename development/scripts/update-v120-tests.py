from pathlib import Path
p=Path(__file__).resolve().parent.parent/'outputs/wx2md-local-v1.2.0/test/archive.test.mjs'
s=p.read_text(encoding='utf-8')
s=s.replace('mkdtemp, readFile, rm','mkdtemp, readFile, rm, readdir')
s=s.replace("import { sanitizeMarkdownHtml }", "import { sanitizeMarkdownHtml, renderMarkdown }")
s=s.replace("test('真实浏览器归档：原样式 HTML、PNG、Markdown、本地图片与断网验证', { timeout: 120000 }", "test('真实浏览器归档：恰好五个标题命名文件，MD和HTML内嵌原图，手机电脑单张长图', { timeout: 300000 }")
s=s.replace("    const md = await readFile(path.join(result.outputDir, 'article.md'), 'utf8');\n    const html = await readFile(path.join(result.outputDir, 'original.html'), 'utf8');\n    const png = await readFile(path.join(result.outputDir, 'original.png'));", """    const names = result.metadata.file_names;
    assert.deepEqual((await readdir(result.outputDir)).sort(), Object.values(names).sort());
    assert.ok(Object.values(names).every(name => name.startsWith('归档测试文章')));
    const md = await readFile(path.join(result.outputDir, names.markdown), 'utf8');
    const html = await readFile(path.join(result.outputDir, names.html), 'utf8');
    const png = await readFile(path.join(result.outputDir, names.mobile));""")
start=s.index('    assert.match(md, /images')
end=s.index('    assert.match(md, /\\*\\*样式粗体',start)
s=s[:start]+"""    assert.match(md, /data:image\\/png;base64,/); assert.equal(result.metadata.markdown_images.count, 1);
    assert.match(md, /!\\[延迟图片\\]\\[wx2md-image-001\\]/);
    assert.match(html, /data:image\\/png;base64,/); assert.match(html, /#205e42/);
    assert.match(html, /href="#wx2md-original-001"/); assert.equal(result.metadata.html_images.linked, 2);
    const embedded = md.match(/data:image\\/png;base64,([A-Za-z0-9+/=]+)/)[1];
    assert.deepEqual(Buffer.from(embedded,'base64'), pixel);
    assert.ok(!/<img[^>]+\\ssrc="https?:/.test(html));
    assert.equal(png.subarray(1,4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1296);
    assert.equal(png.readUInt32BE(20), result.metadata.files[names.mobile].height);
    assert.equal(result.metadata.screenshot_scale, 3);
    for (const profile of Object.values(result.metadata.screenshot_profiles)) {
      assert.equal(profile.check.complete,true);
      assert.equal(profile.check.maxOverlapDifference,0);
      assert.equal(profile.check.coveredRows,result.metadata.files[profile.file].height);
    }
"""+s[end:]
s=s.replace("path.join(result.outputDir, 'original.html')", "path.join(result.outputDir, names.html)")
start=s.index("      const popupPromise = page.waitForEvent('popup');")
end=s.index("      assert.equal(await page.locator('article table')",start)
s=s[:start]+"""      await page.locator('#js_content img').first().click();
      await page.locator('#wx2md-original-001').waitFor({state:'visible'});
      assert.equal(await page.locator('#wx2md-original-001>img').evaluate(e=>e.naturalWidth),1);
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#wx2md-original-001 a[download]').click();
      const download = await downloadPromise;
      assert.equal(await download.failure(),null);
      await page.setContent('<article></article>');
      const rendered = await page.evaluate(sanitizeMarkdownHtml,renderMarkdown(md));
      await page.locator('article').evaluate((e,html)=>e.innerHTML=html,rendered);
"""+s[end:]
s=s.replace("assert.equal(await page.locator('.formula svg').count(), 2);", "assert.match(md,/y = x\\^2/);")
s=s.replace("path.join(partial.outputDir, 'article.md')", "path.join(partial.outputDir, partial.metadata.file_names.markdown)")
s=s.replace("assert.ok(tall.metadata.screenshots.length > 1);\n    assert.ok(tall.metadata.screenshots.every(name => tall.metadata.files[name].width === 1290));\n    assert.ok(tall.metadata.screenshots.reduce((total, name) => total + tall.metadata.files[name].height, 0) > 105000);", """assert.equal(tall.metadata.screenshots.length,2);
    assert.ok(tall.metadata.screenshots.every(name => tall.metadata.files[name].height > 105000));
    assert.equal((await readdir(tall.outputDir)).length,5);""")
p.write_text(s,encoding='utf-8')
print('Updated browser archive regression test to v1.2.0 output contract.')
