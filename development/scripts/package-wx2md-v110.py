from pathlib import Path
import zipfile, json, html, hashlib
root = Path(__file__).resolve().parent.parent
outputs = root / 'outputs'
app = outputs / 'wx2md-local-v1.1.0'
report = json.loads((root / 'work/wx2md-v110-verification.json').read_text(encoding='utf-8'))
job = report['job']; meta = job['metadata']; archive = Path(job['output_dir'])
excluded = {'node_modules','data','logs','archives','outputs','.git','.staging'}
package = outputs / 'wx2md-local-v1.1.0.zip'
with zipfile.ZipFile(package, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as target:
    for item in sorted(app.rglob('*')):
        relative = item.relative_to(app)
        if item.is_file() and not any(part in excluded for part in relative.parts):
            target.write(item, app.name + '/' + relative.as_posix())
    upstream = (app / 'node_modules/single-file-core').resolve()
    for item in sorted(upstream.rglob('*')):
        if item.is_file():
            target.write(item, app.name + '/third-party-source/single-file-core/' + item.relative_to(upstream).as_posix())
with zipfile.ZipFile(package) as checked:
    names = checked.namelist()
    assert checked.testzip() is None
    for name in ['src/server.mjs','vendor/marked.mjs','vendor/MARKED-LICENSE.md','vendor/singlefile.js','CHANGELOG.txt','LICENSE']:
        assert app.name + '/' + name in names
    assert not any('/data/' in name or '/archives/' in name or '/logs/' in name for name in names)
    assert json.loads(checked.read(app.name + '/package.json'))['version'] == '1.1.0'
    with zipfile.ZipFile(outputs / 'wx2md-local.zip') as baseline:
        assert json.loads(baseline.read('wx2md-local/package.json'))['version'] == '1.0.0'
e = lambda value: html.escape(str(value), quote=True)
link = lambda name: e((archive / name).relative_to(outputs).as_posix())
rows = [
    ('原网页长截图', '旧版 430 × 22032 px → 新版 1290 × 66096 px；3 倍直接渲染、无损 PNG'),
    ('原图保存', '16 张图片均与旧版原文件逐字节相同；保留源图分辨率，无二次压缩'),
    ('HTML 正文图片打开', '通过：本地页面和 file:// 直接双击两种方式均可点击打开 1080 px 原图'),
    ('原图另存', '通过：原图列表可下载原始 JPG 文件'),
    ('长图阅读', '通过：阅读宽度与 100% 像素切换；100% 下显示宽度为 1290 px'),
    ('Markdown 标题', '保留正文 19 个标题及其层级'),
    ('Markdown 表格', '完整保留 3 张表格；行数分别为 9、8、9'),
    ('Markdown 公式', '恢复 3 处原文公式，MD 保留 LaTeX，预览保留原文 SVG'),
    ('Markdown 图片', '16 张，顺序与正文一致，使用本地相对路径'),
    ('断网检查', 'original.html、original-singlefile.html 和 markdown.html 中 16 张正文图片均可显示；远程请求 0'),
    ('超长文章分段', '实际浏览器测试：总高超过 105000 像素，分段后每段保留 1290 px 宽度'),
    ('内容与队列测试', '4 项测试通过：链接、持久队列、飞书消息解析与实际浏览器归档；包含伪图片、合并表格、上下标、MathML 和预览过滤'),
    ('本地接口验证', '无令牌写入、跨站写入和非法截图倍率均被拒绝'),
    ('升级与版本隔离', '原 2 条任务记录及设置已复制；原归档保持原位置，新文件生成在 v1.1.0 目录'),
    ('飞书真实收件 / Mac 运行', '本次未验证，接入方式沿用已有版本'),
]
table = ''.join(f'<tr><td>{e(k)}</td><td>{e(v)}</td></tr>' for k,v in rows)
files = ''.join(f'<li><a href="{link(name)}">{e(name)}</a> · {info["bytes"]:,} 字节</li>' for name,info in meta['files'].items())
document = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>wx2md Local v1.1.0 更新与验证</title><style>:root{{color-scheme:light}}body{{margin:0;background:#f4f4ef;color:#243429;font:15px/1.8 "Segoe UI","Microsoft YaHei",sans-serif}}main{{max-width:960px;margin:auto;padding:40px 28px}}h1{{font-size:29px}}h2{{font-size:21px;margin-top:32px}}table{{width:100%;border-collapse:collapse;background:white;font-size:13px}}th,td{{border:1px solid #dce3d9;padding:12px 16px;text-align:left;vertical-align:top}}th{{background:#e9eee5}}a{{color:#28604a}}.muted{{font-size:12px;color:#788373}}.note{{background:#e9eee5;border-left:4px solid #62886b;padding:14px 20px}}nav{{display:flex;gap:20px;flex-wrap:wrap;margin:22px 0}}li{{margin:8px 0}}@media(max-width:600px){{main{{padding:24px 18px}}td,th{{padding:9px}}}}</style></head><body><main><p class="muted">WX2MD LOCAL v1.1.0 · 2026-10-06 · Windows 实测</p><h1>清晰长图、可打开原图与更完整的 Markdown</h1><p>验证文章：<strong>{e(job['title'])}</strong>，公众号“{e(meta['account'])}”。使用用户提供的同一篇文章核对旧版与新版。</p><nav><a href="http://127.0.0.1:17880">打开新版工具</a><a href="{link('screenshots.html')}">查看清晰长图</a><a href="{link('original.html')}">原格式 HTML</a><a href="{link('markdown.html')}">Markdown 阅读</a><a href="wx2md-local-v1.1.0/public/guide.html">新版指南</a></nav><table><tr><th>验证内容</th><th>结果</th></tr>{table}</table><p class="note">Markdown 尽量保留内容结构，颜色、字号、字体和复杂自由排版仍应以 HTML 或截图为准。编辑 MD 时，查看器需要支持数学公式与内嵌 HTML。源图片的细节受源文件本身限制。</p><h2>版本与文件</h2><p>新版单独保存在 <strong>wx2md-local-v1.1.0</strong>，旧 <strong>wx2md-local（v1.0.0）</strong> 和旧源码 ZIP 均保留。默认新归档进入新版 archives/；旧文章可继续从保存记录访问。以前保存的文件不自动重写，需要新版效果时重新保存。</p><p><a href="wx2md-local-v1.1.0/CHANGELOG.txt">更新记录</a> · <a href="wx2md-local-v1.1.0.zip">下载 v1.1.0 源码包</a></p><p>源码包不含凭据、任务数据库、日志或归档文章。另一个电脑首次启动时需安装 Node.js 与 Edge/Chrome；依赖由启动器安装。</p><ul>{files}</ul><p class="muted">验证时间：{e(report['verified_at'])} · 浏览器 {e(meta['browser'])} · 页面脚本异常 0 · 记录状态 {e(job['status'])}</p></main></body></html>'''
verification = outputs / 'wx2md-v1.1.0-验证记录.html'
verification.write_text(document, encoding='utf-8')
print(json.dumps({'package':str(package),'bytes':package.stat().st_size,'files':len(names),'sha256':hashlib.sha256(package.read_bytes()).hexdigest(),'verification':str(verification)},ensure_ascii=False,indent=2))
