from pathlib import Path
app=Path(__file__).resolve().parent.parent/'outputs/wx2md-local-v1.2.0'
p=app/'src/archive.mjs'; s=p.read_text(encoding='utf-8')
s=s.replace("import { articleToMarkdown, renderMarkdown, sanitizeMarkdownHtml, markdownPreview } from './markdown.mjs';", "import { articleToMarkdown } from './markdown.mjs';")
s=s.replace("import { linkLocalImages, imageGallery, screenshotViewer } from './html.mjs';", "import { linkLocalImages } from './html.mjs';")
s=s.replace("viewport: { width: config.width || 430, height: 900 }", "viewport: { width: 432, height: 768 }")
s=s.replace("await mkdir(path.join(stageDirectory, 'images'), { recursive: true });", """await mkdir(stageDirectory, { recursive: true });
    // Leave room for Windows paths and the longest suffix; normalize unsafe title characters.
    const titleStem = safeName(article.title, Math.max(12, Math.min(70, 240 - finalDirectory.length - 15)));
    const fileNames = { markdown: `${titleStem}.md`, html: `${titleStem}.html`,
      mobile: `${titleStem}_手机.png`, desktop: `${titleStem}_电脑.png`, metadata: `${titleStem}_metadata.json` };""")
s=s.replace("onStage('下载 Markdown 图片');", "onStage('内嵌 Markdown 原图');")
s=s.replace("""const localPath = `images/${String(index + 1).padStart(3, '0')}.${extension}`;
        await writeFile(path.join(stageDirectory, localPath), bytes); mapping[src] = localPath;""", """const mime = { png:'image/png', jpg:'image/jpeg', gif:'image/gif', webp:'image/webp', avif:'image/avif', bmp:'image/bmp', svg:'image/svg+xml' }[extension];
        mapping[src] = `data:${mime};base64,${bytes.toString('base64')}`;""")
s=s.replace("imageFiles.push({ path: localPath, source:", "imageFiles.push({ index: index + 1, mime, source:")
s=s.replace("""await writeFile(path.join(stageDirectory, 'article.md'), markdown, 'utf8');
    const renderedMarkdown = await page.evaluate(sanitizeMarkdownHtml, renderMarkdown(markdown, article.formulas));
    await writeFile(path.join(stageDirectory, 'markdown.html'), markdownPreview(article, renderedMarkdown), 'utf8');""", "await writeFile(path.join(stageDirectory, fileNames.markdown), markdown, 'utf8');")
start=s.index("    await writeFile(path.join(stageDirectory, 'original-singlefile.html')")
end=s.index("    onStage('检查离线文件');", start)
s=s[:start]+"""    const embeddedHtml = await page.evaluate(linkLocalImages, { html, mapping, embedded: true });
    if (embeddedHtml.linked < article.images.filter(image => mapping[image.src]).length) warnings.push('部分 HTML 图片未能替换为下载到的原图。');
    await writeFile(path.join(stageDirectory, fileNames.html), embeddedHtml.html, 'utf8');

"""+s[end:]
s=s.replace("path.join(stageDirectory, 'original.html')", "path.join(stageDirectory, fileNames.html)")
s=s.replace("localImages: [...document.querySelectorAll('#js_content img')].filter(i => /^images\\//.test(i.getAttribute('src') || '')).length,", "embeddedImages: [...document.querySelectorAll('#js_content img')].filter(i => /^data:image\\//.test(i.getAttribute('src') || '')).length,")
start=s.index("    onStage('逐屏采集并检查长截图接缝');")
end=s.index("    if (!offlineCheck.bodyPresent)", start)
s=s[:start]+"""    await offlinePage.close();
    const profiles = { mobile: { width:432, height:768, ratio:'9:16', label:'手机' }, desktop: { width:1280, height:720, ratio:'16:9', label:'电脑' } };
    const screenshotProfiles = {};
    const screenshotFiles = [];
    for (const [name, profile] of Object.entries(profiles)) {
      onStage(`按${profile.label}阅读窗口排版并检查长图接缝`);
      const capturePage = await context.newPage();
      try {
        await capturePage.setViewportSize({width:profile.width,height:profile.height});
        await capturePage.route('**/*', route => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
        await capturePage.goto(pathToFileURL(path.join(stageDirectory,fileNames.html)).href, {waitUntil:'load',timeout:30000});
        const captured = await captureScreenshot(capturePage, stageDirectory, warnings, captureScale, onStage,
          { stem:path.basename(fileNames[name],'.png'), label:profile.label, fitToViewport:true, cropToArticle:true, singleFile:true });
        screenshotProfiles[name] = { viewport: {width:profile.width,height:profile.height,ratio:profile.ratio,deviceScaleFactor:captureScale}, file:fileNames[name], check:captured.check };
        screenshotFiles.push(...captured.files);
      } finally { await capturePage.close(); }
    }
"""+s[end:]
s=s.replace("详情见 metadata.json。", "详情见标题命名的 metadata 文件。")
s=s.replace("['article.md', 'markdown.html', 'original.html', 'original-singlefile.html', 'images.html', 'screenshots.html', ...screenshotFiles]", "[fileNames.markdown, fileNames.html, ...screenshotFiles]")
start=s.index('    const metadata = {')
end=s.index("    await mkdir(path.dirname(finalDirectory)",start)
s=s[:start]+"""    const metadata = {
      format_version: 4, tool: 'wx2md-local', tool_version: '1.2.0', status: warnings.length ? 'partial' : 'completed',
      title: article.title, account: article.accountName, author: article.author, published_at: article.publishTime,
      original_url: job.url, resolved_url: article.sourceUrl, saved_at: savedAt.toISOString(), timezone: 'Asia/Shanghai',
      source: job.source || 'manual', browser: browser.version(), platform: process.platform,
      file_names: fileNames, files: fileInfo, screenshots: screenshotFiles, screenshot_scale: captureScale,
      screenshot_profiles: screenshotProfiles, image_files: imageFiles,
      html_files: [fileNames.html], html_images: {mode:'embedded-originals',linked:embeddedHtml.linked,original_bytes_preserved:true},
      markdown_images: { mode:'embedded-originals',count:imageFiles.length,original_bytes_preserved:true },
      failed_images: failedImages, failed_resources: [...failedResources], markdown_structure: article.structure,
      warnings: [...new Set(warnings)], offline_check: offlineCheck, omitted_statistics_requests: [...auxiliaryRequests]
    };
    await writeFile(path.join(stageDirectory, fileNames.metadata), JSON.stringify(metadata, null, 2), 'utf8');
"""+s[end:]
p.write_text(s,encoding='utf-8')
p=app/'src/html.mjs';s=p.read_text(encoding='utf-8')
s=s.replace('<a href="images.html">查看原图</a>${downloads}', '${imageGalleryUrl ? `<a href="${escape(imageGalleryUrl)}">查看原图</a>` : \'\'}${downloads}')
p.write_text(s,encoding='utf-8')
print('Updated v1.2.0 archive: self-contained MD / HTML, two profile PNGs, title-based five-file output.')
