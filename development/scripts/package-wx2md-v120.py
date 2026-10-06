from pathlib import Path
import json,zipfile,html,hashlib
from urllib.parse import quote
root=Path(__file__).resolve().parent.parent
outputs=root/'outputs';app=outputs/'wx2md-local-v1.2.0'
report=json.loads((root/'work/wx2md-v120-verification.json').read_text(encoding='utf-8'))
job=report['job'];meta=job['metadata'];archive=Path(job['output_dir'])
assert len(list(archive.iterdir()))==5
excluded={'node_modules','data','logs','archives','outputs','.git','.staging'}
package=outputs/'wx2md-local-v1.2.0.zip'
with zipfile.ZipFile(package,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as target:
    for item in sorted(app.rglob('*')):
        relative=item.relative_to(app)
        if item.is_file() and not any(part in excluded for part in relative.parts):target.write(item,app.name+'/'+relative.as_posix())
    source=(app/'node_modules/single-file-core').resolve()
    for item in sorted(source.rglob('*')):
        if item.is_file():target.write(item,app.name+'/third-party-source/single-file-core/'+item.relative_to(source).as_posix())
with zipfile.ZipFile(package) as checked:
    names=checked.namelist();assert checked.testzip() is None
    for name in ['src/archive.mjs','src/screenshot.mjs','src/png-stream.mjs','vendor/pngjs/lib/png.js','vendor/pngjs/LICENSE','public/guide.html','CHANGELOG.txt','README.txt','LICENSE']:assert app.name+'/'+name in names
    assert not any('/data/' in name or '/archives/' in name or '/logs/' in name for name in names)
    assert json.loads(checked.read(app.name+'/package.json'))['version']=='1.2.0'
old_versions={}
for version,directory in [('1.0.0','wx2md-local'),('1.1.0','wx2md-local-v1.1.0'),('1.1.1','wx2md-local-v1.1.1')]:
    checked_count=0
    with zipfile.ZipFile(outputs/(directory+'.zip'))as previous:
        for info in previous.infolist():
            rel=Path(info.filename)
            if rel.parts[0]!=directory or info.is_dir():continue
            local=outputs/rel
            if local.is_file() and not any(part in excluded for part in rel.parts[1:]):
                assert local.read_bytes()==previous.read(info.filename),f'Old source changed: {local}'
                checked_count+=1
    old_versions[version]={'sourceFilesUnchanged':checked_count}
e=lambda value:html.escape(str(value),quote=True)
link=lambda name:quote((archive/name).relative_to(outputs).as_posix(),safe='/')
profiles=meta['screenshot_profiles'];files=meta['file_names']
rows=[('归档文件','恰好 5 个，全部以文章标题命名，无图片目录或其他预览文件。'),
      ('手机长图',f'{meta["files"][files["mobile"]]["width"]} × {meta["files"][files["mobile"]]["height"]} px，432×768 阅读窗口（9:16）。'),
      ('电脑长图',f'{meta["files"][files["desktop"]]["width"]} × {meta["files"][files["desktop"]]["height"]} px，1280×720 阅读窗口（16:9），裁掉文章栏外空白。'),
      ('接缝与覆盖',f'手机 {profiles["mobile"]["check"]["verticalChecks"]} 处、电脑 {profiles["desktop"]["check"]["verticalChecks"]} 处上下接缝；重叠区平均差均为 0；从第 0 行连续覆盖到结尾。'),
      ('独立像素复核','每种长图各 6 处，对照正常视口重新采集。12 处中 11 处逐像素相同；电脑一处的 1 个像素差 1 个色阶，其余像素一致。'),
      ('表格','3 张表格保留 9 / 8 / 9 行；第一张表格 6 列完整。手机版仅宽表格换行，没有扩展截图画布。'),
      ('Markdown','保留 19 个标题、3 张表格、3 处公式与 16 张图片；原图引用定义内嵌，无外部图片目录。'),
      ('HTML 与图片','断网后 16 张正文图片加载成功，点击可查看原始尺寸与下载；下载和 MD 内嵌原图 SHA-256 与旧归档相同。'),
      ('浏览器测试','6 项回归测试分别通过：链接、队列恢复与去重、飞书消息过滤、五文件归档／超长单张、拼接内容完整、两种窗口与宽表格。'),
      ('版本与运行','更新前 v1.1.1；当前 v1.2.0。复制停止后的 5 条任务记录与设置，旧归档路径保持可访问。'),
      ('旧版保留',f'源文件逐项核对旧源码 ZIP，无修改：{json.dumps(old_versions,ensure_ascii=False)}。旧版设置和文章保留。'),
      ('界面与接口','界面脚本异常 0；非法倍率、未授权写入、跨站请求与非归档文件请求均被拒绝。'),
      ('本次未验收','实际飞书消息投递和 Mac 运行；已有飞书设置照常保留。')]
table=''.join(f'<tr><td>{e(k)}</td><td>{e(v)}</td></tr>'for k,v in rows)
file_rows=''.join(f'<tr><td><a href="{link(name)}">{e(name)}</a></td><td>{e(purpose)}</td></tr>'for name,purpose in [(files['markdown'],'可编辑 Markdown，原图内嵌。'),(files['html'],'图片和样式内嵌的原排版 HTML。'),(files['mobile'],'手机阅读宽度无损整篇长图。'),(files['desktop'],'电脑文章栏宽度无损整篇长图。'),(files['metadata'],'来源、版本、尺寸、文件校验与离线检查信息。')])
document=f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>wx2md Local v1.2.0 发布与验证</title><style>:root{{color-scheme:light}}body{{margin:0;background:#f4f4ef;color:#243429;font:15px/1.8 "Segoe UI","Microsoft YaHei",sans-serif}}main{{max-width:980px;margin:auto;padding:40px 28px}}h1{{font-size:29px}}h2{{font-size:21px;margin-top:32px}}table{{width:100%;border-collapse:collapse;background:white;font-size:13px;overflow-wrap:anywhere}}th,td{{border:1px solid #dce3d9;padding:12px 16px;text-align:left;vertical-align:top}}th{{background:#e9eee5}}a{{color:#28604a}}.muted{{font-size:12px;color:#788373}}.note{{background:#e9eee5;border-left:4px solid #62886b;padding:14px 20px}}nav{{display:flex;gap:20px;flex-wrap:wrap;margin:22px 0}}@media(max-width:600px){{main{{padding:24px 18px}}td,th{{padding:9px}}}}</style></head><body><main><p class="muted">WX2MD LOCAL v1.2.0 · 2026-10-06 · Windows 实测</p><h1>五个文件，两种阅读宽度，按文章标题命名。</h1><p>实测文章：<strong>{e(job['title'])}</strong>。新版归档位于独立 v1.2.0 目录，原归档保留。</p><nav><a href="http://127.0.0.1:17880/view/{job['id']}/mobile">手机长图阅读</a><a href="http://127.0.0.1:17880/view/{job['id']}/desktop">电脑长图阅读</a><a href="{link(files['html'])}">内嵌 HTML</a><a href="http://127.0.0.1:17880">打开工具</a><a href="http://127.0.0.1:17880/health">当前服务版本</a></nav><table><tr><th>核对内容</th><th>结果</th></tr>{table}</table><h2>示例文章的五个文件</h2><table><tr><th>实际文件名</th><th>用途</th></tr>{file_rows}</table><p class="note">9:16 与 16:9 指手机和电脑的浏览器阅读窗口，长图高度取决于文章长度。截图保留 3 倍设备像素，不再缩放或有损压缩；宽表格在阅读宽度内换行，保留全部列。MD 阅读器需支持内嵌 data URI 图片、数学公式和 HTML 表格。</p><h2>当前服务与以后升级</h2><p>当前已从 v1.1.1 切换为 v1.2.0，刷新本地页面即可使用。底部显示实际服务版本，“保存设置”显示程序路径。</p><p>以后升级：解压到新的版本目录 → 停止旧版服务 → 需要继承数据时，在新版尚未运行前复制旧版 data/config.json 与 data/jobs.sqlite → 双击新版启动文件 → 刷新并核对版本。在设置中调整新文章保存位置。旧文章不会自动转换，点击重新保存生成新版文件。</p><p><a href="wx2md-local-v1.2.0.zip">v1.2.0 源码 ZIP</a> · <a href="wx2md-local-v1.2.0/public/guide.html">完整指南</a> · <a href="wx2md-local-v1.2.0/CHANGELOG.txt">版本更新记录</a></p><p>源码包不包含个人设置、凭据、任务库或文章。</p><p class="muted">验证时间 {e(report['verified_at'])} · 浏览器 {e(meta['browser'])}</p></main></body></html>'''
(outputs/'wx2md-v1.2.0-验证记录.html').write_text(document,encoding='utf-8')
release={'version':'1.2.0','package':str(package),'bytes':package.stat().st_size,'files':len(names),'sha256':hashlib.sha256(package.read_bytes()).hexdigest(),'archive':str(archive),'old_versions':old_versions}
(root/'work/wx2md-v120-release.json').write_text(json.dumps(release,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(release,ensure_ascii=False,indent=2))
