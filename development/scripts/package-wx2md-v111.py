from pathlib import Path
import json,zipfile,html,hashlib
root=Path(__file__).resolve().parent.parent
outputs=root/'outputs';app=outputs/'wx2md-local-v1.1.1'
report=json.loads((root/'work/wx2md-v111-verification.json').read_text(encoding='utf-8'))
job=report['job'];meta=job['metadata'];archive=Path(job['output_dir']);capture=meta['screenshot_check']
excluded={'node_modules','data','logs','archives','outputs','.git','.staging'}
package=outputs/'wx2md-local-v1.1.1.zip'
with zipfile.ZipFile(package,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as target:
    for item in sorted(app.rglob('*')):
        relative=item.relative_to(app)
        if item.is_file() and not any(part in excluded for part in relative.parts):target.write(item,app.name+'/'+relative.as_posix())
    source=(app/'node_modules/single-file-core').resolve()
    for item in sorted(source.rglob('*')):
        if item.is_file():target.write(item,app.name+'/third-party-source/single-file-core/'+item.relative_to(source).as_posix())
with zipfile.ZipFile(package) as checked:
    names=checked.namelist();assert checked.testzip() is None
    for name in ['src/screenshot.mjs','src/png-stream.mjs','vendor/pngjs/lib/png.js','vendor/pngjs/LICENSE','public/guide.html','CHANGELOG.txt','LICENSE']:assert app.name+'/'+name in names
    assert not any('/data/' in name or '/archives/' in name or '/logs/' in name for name in names)
    assert json.loads(checked.read(app.name+'/package.json'))['version']=='1.1.1'
e=lambda value:html.escape(str(value),quote=True)
link=lambda name:e((archive/name).relative_to(outputs).as_posix())
checks=[
('复现旧长图问题','参考用户指出的 v1.1.0 original.png：中后段与正常滚动位置不一致，重复标题/作者区域。'),
('修复方式','从离线原网页逐屏采集，按实际滚动位置裁剪重叠；隐藏正文外悬浮工具栏，展开横向表格。'),
('实际长图尺寸',f'{capture["pixelWidth"]} × {capture["pixelHeight"]} px；3 倍分辨率，无损 PNG；宽度包含表格所有列。'),
('完整覆盖',f'共 {len(capture["tiles"])} 组画面，累计覆盖 {capture["coveredRows"]} 像素行，连续从第 0 行到结尾。'),
('接缝检查',f'{capture["verticalChecks"]} 处上下接缝，{capture["horizontalChecks"]} 处横向接缝；最大重叠区像素差 {capture["maxOverlapDifference"]}。'),
('独立像素核对','顶部、中段、底部和接缝附近共 6 处抽样，解码最终 PNG 后，与正常视口截图像素一致。'),
('测试','5 项通过；新增 30 个不同颜色正文块的像素检查，验证段落不重复、不丢失，结尾完整，悬浮工具栏不进入截图。'),
('其他输出','Markdown 的 19 个标题、3 张表格、3 处公式与 16 张图片保留；HTML 本地原图打开、下载和断网阅读通过。'),
('原图','16 个图片文件与原始归档逐字节相同，无二次压缩。'),
('版本与数据','独立 v1.1.1 文件夹；复制原 3 条任务记录与设置；原 v1.1.0 和 v1.0.0 程序、文章及源码包保留。'),
('界面与接口','页面脚本异常 0；未授权写入、跨站写入与非法截图倍率仍被拒绝。'),
('飞书 / Mac','本次没有验证实际飞书收件或 Mac 运行。'),
]
rows=''.join(f'<tr><td>{e(k)}</td><td>{e(v)}</td></tr>'for k,v in checks)
files=[('article.md','可编辑 Markdown 正文；图片来自 images/。'),('markdown.html','Markdown 阅读预览；依赖 images/，不需要在线加载脚本。'),('original.html','原排版 HTML，可点击原图；需保留 images/。'),('original-singlefile.html','图片内嵌的 HTML 副本，可以单独携带。'),('original.png / original-001.png 等','无损长图；只有特别长的文章才分段，需要保留所有分段。'),('screenshots.html','长图阅读页，支持缩放和下载；依赖对应 PNG。'),('images/','共享的原始图片文件。'),('images.html','原图列表和下载页面；依赖 images/。'),('metadata.json','来源、日期、版本、文件校验值、截图覆盖与接缝检查记录。')]
file_rows=''.join(f'<tr><td>{e(k)}</td><td>{e(v)}</td></tr>'for k,v in files)
document=f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>wx2md v1.1.1 长截图修复与文件说明</title><style>:root{{color-scheme:light}}body{{margin:0;background:#f4f4ef;color:#243429;font:15px/1.8 "Segoe UI","Microsoft YaHei",sans-serif}}main{{max-width:980px;margin:auto;padding:40px 28px}}h1{{font-size:29px}}h2{{font-size:21px;margin-top:32px}}table{{width:100%;border-collapse:collapse;background:white;font-size:13px}}th,td{{border:1px solid #dce3d9;padding:12px 16px;text-align:left;vertical-align:top}}th{{background:#e9eee5}}a{{color:#28604a}}.muted{{font-size:12px;color:#788373}}.note{{background:#e9eee5;border-left:4px solid #62886b;padding:14px 20px}}nav{{display:flex;gap:20px;flex-wrap:wrap;margin:22px 0}}@media(max-width:600px){{main{{padding:24px 18px}}td,th{{padding:9px}}}}</style></head><body><main><p class="muted">WX2MD LOCAL v1.1.1 · 2026-10-06 · Windows 实测</p><h1>修复长图错位、重复与缺内容</h1><p>用户指定的参考文件属于文章 <strong>{e(job['title'])}</strong>。新版本另存归档，原文件没有覆盖。</p><nav><a href="{link('screenshots.html')}">查看修复后的长图</a><a href="{link('original.png')}">下载 PNG</a><a href="{link('original.html')}">原格式 HTML</a><a href="wx2md-local-v1.1.1/public/guide.html#files">完整文件说明</a><a href="http://127.0.0.1:17880">打开工具</a></nav><table><tr><th>核对内容</th><th>结果</th></tr>{rows}</table><h2>每个输出文件是什么</h2><table><tr><th>文件</th><th>用途与依赖</th></tr>{file_rows}</table><p class="note">最方便的备份方式是保留整篇文章目录。如果只需要一个可离线阅读的文件，选择 original-singlefile.html；编辑 Markdown 则保留 article.md 与 images/；只要长图则保留 PNG。辅助预览页不是额外的独立正文，需对应媒体文件才能显示。</p><p><a href="wx2md-local-v1.1.1.zip">下载 v1.1.1 源码包</a> · <a href="wx2md-local-v1.1.1/CHANGELOG.txt">更新记录</a></p><p>源码包不包含个人设置、凭据、任务数据库和文章。旧文章不会自动改写，点击重新保存可以生成新版本。</p><p class="muted">验证时间 {e(report['verified_at'])} · 浏览器 {e(meta['browser'])} · SHA-256 {e(meta['files']['original.png']['sha256'])}</p></main></body></html>'''
(outputs/'wx2md-v1.1.1-验证记录.html').write_text(document,encoding='utf-8')
print(json.dumps({'package':str(package),'bytes':package.stat().st_size,'files':len(names),'sha256':hashlib.sha256(package.read_bytes()).hexdigest(),'article':str(archive)},ensure_ascii=False,indent=2))
