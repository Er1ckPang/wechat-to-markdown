from pathlib import Path
import json
import zipfile
import html
import struct
from datetime import datetime

root = Path(__file__).resolve().parent.parent
app = root / 'outputs' / 'wx2md-local'
outputs = root / 'outputs'
report = json.loads((root / 'work' / 'wx2md-verification.json').read_text(encoding='utf-8'))
article = report['actual_article']
archive = Path(article['outputDir'])
png = (archive / 'original.png').read_bytes()
png_width, png_height = struct.unpack('>II', png[16:24])

excluded = {'node_modules', 'data', 'logs', 'archives', 'outputs', '.git', '.staging'}
package = outputs / 'wx2md-local.zip'
with zipfile.ZipFile(package, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as target:
    for item in sorted(app.rglob('*')):
        relative = item.relative_to(app)
        if item.is_file() and not any(part in excluded for part in relative.parts):
            target.write(item, 'wx2md-local/' + relative.as_posix())
    # Preserve the exact unmodified source behind the distributed SingleFile bundle.
    upstream = (app / 'node_modules' / 'single-file-core').resolve()
    for item in sorted(upstream.rglob('*')):
        if item.is_file():
            target.write(item, 'wx2md-local/third-party-source/single-file-core/' + item.relative_to(upstream).as_posix())

def e(value):
    return html.escape(str(value))

checks = [
    ('手动页面提交真实文章', '通过'),
    ('Markdown 本地正文图片', f"{article['imageCount']} 张，全部成功"),
    ('原格式 HTML 断网检查', '16 张正文图片均内嵌并能显示；没有远程样式引用'),
    ('原网页长截图', f'{png_width} × {png_height} px'),
    ('重复文章与重复消息处理', '通过，不重复生成任务'),
    ('持久队列与重启恢复', '通过本地数据库测试'),
    ('图片伪装为成功响应', '通过，识别非图片内容并明确显示保存提示'),
    ('无令牌、跨站和非公众号写入', '均被拒绝'),
    ('页面、手机宽度与使用指南', '通过，页面脚本无异常'),
    ('飞书真实账号收件', '未验证：尚未创建飞书应用、未提供凭据'),
    ('Mac 运行', '未验证：提供了跨平台代码与启动脚本'),
]
rows = ''.join(f'<tr><td>{e(name)}</td><td>{e(result)}</td></tr>' for name, result in checks)
metadata = article['metadata']
files = ''.join(f'<li><a href="{e((archive / filename).relative_to(outputs).as_posix())}">{e(filename)}</a> · {info["bytes"]:,} 字节</li>' for filename, info in metadata['files'].items())
document = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>wx2md Local 验证记录</title><style>
:root{{color-scheme:light}}body{{background:#f4f4ef;color:#243429;margin:0;font:15px/1.8 "Segoe UI","Microsoft YaHei",sans-serif}}main{{max-width:900px;margin:auto;padding:45px 30px}}h1{{font-size:30px}}h2{{font-size:20px;margin-top:30px}}table{{width:100%;border-collapse:collapse;background:white;font-size:13px}}td,th{{border:1px solid #dce3d9;padding:12px 16px;text-align:left}}th{{background:#e9eee5}}a{{color:#28604a}}.note{{padding:15px 20px;background:#e9eee5;border-left:4px solid #62886b}}.muted{{font-size:12px;color:#788373}}code{{word-break:break-all}}
</style></head><body><main><p class="muted">WX2MD LOCAL 1.0.0 · 2026-09-30 · WINDOWS 实测</p><h1>工具验证记录</h1><p>实际保存文章：<strong>{e(article['title'])}</strong>，公众号“{e(metadata['account'])}”。</p><p><a href="{e(article['url'])}">查看原文</a> · <a href="wx2md-local/public/guide.html">使用指南</a> · <a href="http://127.0.0.1:17880">打开本地工具</a></p><table><tr><th>验证内容</th><th>结果</th></tr>{rows}</table><h2>已生成的实际文件</h2><ul>{files}</ul><p>离线 HTML 正文长度约 {metadata['offline_check']['bodyTextLength']:,} 字符，正文图片 {metadata['offline_check']['images']} 张。长截图按手机阅读宽度保存；原页面横向滚动表格的更多列可在离线 HTML 中查看，Markdown 保留完整表格。</p><p class="note">飞书长连接、消息解析与持久队列已实现，并验证了本地模拟消息。真实飞书收件仍需创建企业自建应用、配置单聊消息事件和权限、发布应用并填写凭据后验收。当前没有读取任何飞书会话或发送任何飞书消息。</p><h2>程序与来源</h2><p>本地版基于 wx2md Community 的清理与转换逻辑，新增 Playwright 截图、SingleFile 原页面保存、中文操作页面、SQLite 队列和飞书收件。源代码与许可证在工具包中。工具包不包含个人凭据、任务数据库或归档文章；迁移到其他电脑时需要安装 Node.js 24 LTS 和 Edge/Chrome，首次启动会安装依赖。</p><p><a href="wx2md-local.zip">下载工具源码包</a></p><p class="muted">验证时间：{e(report['verified_at'])} · 浏览器版本：{e(metadata['browser'])} · 页面脚本异常：0</p></main></body></html>'''
(outputs / 'wx2md-验证记录.html').write_text(document, encoding='utf-8')

with zipfile.ZipFile(package) as checked:
    names = checked.namelist()
    assert any(name.endswith('src/server.mjs') for name in names)
    assert any(name.endswith('vendor/singlefile.js') for name in names)
    assert any(name.endswith('/LICENSE') for name in names)
    assert not any('/data/' in name or '/archives/' in name for name in names)
print(json.dumps({'package': str(package), 'package_bytes': package.stat().st_size, 'packaged_files': len(names), 'article_directory': str(archive), 'png_size': [png_width, png_height], 'verification_report': str(outputs / 'wx2md-验证记录.html')}, ensure_ascii=False, indent=2))
