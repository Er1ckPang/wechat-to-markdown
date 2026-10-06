from pathlib import Path
root=Path(__file__).resolve().parent.parent
app=root/'outputs/wx2md-local-v1.2.1'
p=app/'test/archive.test.mjs';s=p.read_text(encoding='utf-8')
s=s.replace('mkdtemp, readFile, rm, readdir','mkdtemp, readFile, rm, readdir, mkdir, cp')
s=s.replace('恰好五个标题命名文件，MD和HTML内嵌原图','五个标题命名文件加images目录，MD本地引用、HTML内嵌原图')
s=s.replace("Object.values(names).sort());", "[...Object.values(names),'images'].sort());")
s=s.replace("assert.match(md, /data:image\\/png;base64,/); assert.equal(result.metadata.markdown_images.count, 1);", "assert.ok(!md.includes('data:image/')); assert.equal(result.metadata.markdown_images.count, 1);\n    assert.equal(result.metadata.markdown_images.mode,'local-originals');")
s=s.replace("assert.match(md, /!\\[延迟图片\\]\\[wx2md-image-001\\]/);", "assert.match(md, /!\\[延迟图片\\]\\(images\\/001.png\\)/);\n    assert.match(md, /!\\[重复图片\\]\\(images\\/001.png\\)/);")
s=s.replace("const embedded = md.match(/data:image\\/png;base64,([A-Za-z0-9+/=]+)/)[1];\n    assert.deepEqual(Buffer.from(embedded,'base64'), pixel);", "assert.deepEqual(await readFile(path.join(result.outputDir,'images/001.png')),pixel);\n    assert.deepEqual(await readdir(path.join(result.outputDir,'images')),['001.png']);\n    assert.equal(result.metadata.image_files[0].path,'images/001.png');")
s=s.replace("assert.equal(await page.locator('article table').count(), 2);", """assert.equal(await page.locator('article table').count(), 2);
      await page.locator('article img').evaluateAll(async images => { await Promise.all(images.map(i=>i.decode())); if(images.some(i=>!i.naturalWidth))throw new Error('Markdown 本地图片无法显示'); });
      // Moving the MD and images together must preserve portable relative references.
      const moved=path.join(temp,'移动验证'); await mkdir(moved);
      await cp(path.join(result.outputDir,'images'),path.join(moved,'images'),{recursive:true});
      await page.goto(pathToFileURL(path.join(moved,'不存在的文件.html')).href).catch(()=>{});
      await page.setContent(`<base href="${pathToFileURL(moved+path.sep).href}"><article></article>`);
      await page.locator('article').evaluate((e,html)=>e.innerHTML=html,rendered);
      const widths=await page.locator('article img').evaluateAll(async images=>{await Promise.all(images.map(i=>i.decode()));return images.map(i=>i.naturalWidth);});
      assert.deepEqual(widths,[1,1]);""")
s=s.replace("assert.equal((await readdir(tall.outputDir)).length,5);", "assert.equal((await readdir(tall.outputDir)).length,6);")
p.write_text(s,encoding='utf-8')
p=app/'public/index.html';s=p.read_text(encoding='utf-8')
s=s.replace('保存内嵌图片的 MD 与 HTML、手机和电脑两张无损长图。每篇只有 5 个文件，均按标题命名。','保存可编辑 MD、内嵌图片 HTML、手机和电脑两张无损长图。每篇 5 个标题命名文件，加一个 images 原图目录。')
s=s.replace('MD 与 HTML 内嵌原图，不需要图片目录；','MD 的原图保存在 images/，使用本地相对路径引用；移动 MD 时请连同 images/ 一起移动。HTML 内嵌原图，可独立携带；')
p.write_text(s,encoding='utf-8')
p=app/'public/guide.html';s=p.read_text(encoding='utf-8').replace('1.2.0','1.2.1')
s=s.replace('查看三个版本','查看保存结果')
s=s.replace('每篇文章只有 5 个文件','每篇文章：5 个文件 + images 原图目录')
s=s.replace('      文章标题_metadata.json</pre>','      文章标题_metadata.json\n      images/\n        001.jpg\n        002.png\n        …</pre>')
s=s.replace('正文原图以 data URI 引用定义内嵌在文件末尾，重复图片复用定义，无需图片目录。','正文原图保存在 images/ 下，使用 images/001.jpg 等相对路径引用，重复图片复用同一文件。移动或备份 MD 时，请连同 images/ 一起保存。')
s=s.replace('</tr></table>\n<p>每个保留文件', '</tr><tr><td><code>images/</code></td><td>供 Markdown 引用的原始图片文件，按 001.jpg、002.png 等编号，保留原始字节、不重新压缩。HTML 不依赖此目录。</td></tr></table>\n<p>每个保留文件',1)
s=s.replace('每个保留文件都按文章标题命名','五个顶层文件都按文章标题命名')
s=s.replace('新版不再保存单独的图片目录、额外 HTML 副本、原图列表或辅助阅读页。MD 与 HTML 都能独立携带；PNG 可以分别复制。JSON 中的 SHA-256 用于核对其余四个内容文件','新版恢复 images/ 作为 MD 的本地图片目录，不保存额外 HTML 副本、原图列表或辅助阅读页。MD 需与 images/ 一起携带；HTML 和 PNG 可独立复制。JSON 中的 SHA-256 用于核对四个内容文件与本地图片')
s=s.replace('Markdown 阅读器需要支持 data URI 图片、内嵌 HTML 和数学公式','Markdown 阅读器需要支持本地相对路径图片、内嵌 HTML 和数学公式')
s=s.replace('编辑正文时，可折叠或暂时避开文件末尾的图片定义。','MD 不再写入长串 Base64 图片内容，正文更方便编辑。')
s=s.replace('MD 图片或公式不显示</td><td>阅读器需支持 data URI 图片、数学公式与内嵌 HTML','MD 图片或公式不显示</td><td>保留 MD 同级的 images/，不要只移动 MD；阅读器需支持数学公式与内嵌 HTML')
s=s.replace('更新前当前电脑运行 v1.1.1','更新前当前电脑运行 v1.2.0')
s=s.replace('需要新文件组合时点击“重新保存”','需要本地图片引用格式时点击“重新保存”')
p.write_text(s,encoding='utf-8')
p=app/'README.txt';s=p.read_text(encoding='utf-8').replace('1.2.0','1.2.1')
s=s.replace('每篇恰好五个标题命名文件：','每篇五个标题命名文件，加一个 images/ 图片目录：')
s=s.replace('可编辑正文，图片原始字节以 data URI 内嵌，独立携带','可编辑正文，图片使用 images/001.jpg 等本地相对路径')
s=s.replace('不再生成 images/、其他 HTML 副本或辅助阅读页文件。','images/ 保存 MD 使用的原始图片字节，重复图片复用编号文件。\n移动或备份 MD 时，请连同 images/ 一起移动；HTML 独立携带。\n不生成其他 HTML 副本或辅助阅读页文件。')
s=s.replace('阅读器需要支持 data URI 图片、数学公式和内嵌 HTML','阅读器需要支持本地图片路径、数学公式和内嵌 HTML')
s=s.replace('更新前服务为 1.1.1','更新前服务为 1.2.0')
s=s.replace('点“重新保存”才生成五文件新格式','点“重新保存”才生成 MD 本地图片格式')
p.write_text(s,encoding='utf-8')
p=app/'CHANGELOG.txt';s=p.read_text(encoding='utf-8')
s=s.replace('wx2md Local 更新记录\n','''wx2md Local 更新记录

1.2.1 — 2026-10-06
  Markdown 恢复 images/ 本地原图目录，使用 images/001.jpg 等相对路径。
  图片保存原始字节，重复图片复用同一文件；metadata 记录路径、大小和校验值。
  HTML 继续内嵌图片与样式；标题命名、手机／电脑两张无损长图沿用 v1.2.0。
  新归档为五个顶层文件加 images/；MD 必须与 images/ 一起移动或备份。
  本地文件接口只允许访问归档记录中列出的图片路径。
  程序独立保存于 wx2md-local-v1.2.1，保留旧版本，迁移设置与任务记录。
''',1)
p.write_text(s,encoding='utf-8')
old=(root/'work/switch-to-v120.mjs').read_text(encoding='utf-8')
old=old.replace('v120','v121').replace('1.2.0','1.2.1').replace('1.1.1','1.2.0')
(root/'work/switch-to-v121.mjs').write_text(old,encoding='utf-8')
print('Updated archive regression test, UI, guide, README and v1.2.1 history.')
